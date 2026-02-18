import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./system-prompt";
import { truncateResponse, hasDrift, isForbiddenStyle } from "./guardrails";
import { normalizeText } from "@/server/normalize";
import { detectState, getLastUserContent } from "@/server/state";
import { detectSelfHarm, makeCrisisReply, detectPanic } from "@/server/crisis";
import { makePanicReply } from "@/server/panic";
import { makeAllianceReply } from "@/server/alliance";
import {
  makeStagnationReply,
  makeStagnationImpasseReply,
} from "@/server/stagnation";
import {
  detectSomaticIntent,
  makeSomaticReply,
  mapClassifierZoneToZone,
  shouldAskClassifierForSomatic,
} from "@/server/somatic";
import {
  allowClassifierPanic,
  allowClassifierSelfHarm,
} from "@/server/crisis";
import { classifyLastUser, type ClassifyResult } from "@/server/classifier";
import { detectModeFromReply, type ChatMode } from "@/server/mode";
import { makeSafeAskReply } from "@/server/fallbackSafe";
import { isDefaultQuick, pickDefaultQuickReply } from "@/server/defaultQuick";
import {
  type QuestionType,
  getLastAssistantQType,
  avoidSetFromLast,
  inferQTypeFromReply,
} from "@/server/qtype";
import { withTimeout, TIMEOUT_MESSAGE } from "@/server/openaiTimeout";
import {
  detectEndIntention,
  detectRepetitionComplaint,
  detectNothingFelt,
  detectOverwhelm,
  NOTHING_FELT_REPLY,
  REPETITION_END_CHOICE_REPLY,
  ENDED_REPLY,
  STABILIZE_REPLY,
  getLastBodyZoneFromMessages,
  getRepeatCounter,
  getLastPromptTypeFromMessages,
  buildSessionFromMessages,
  emptySession,
  type SessionMemory,
} from "@/server/protocolState";

/**
 * SÉCURITÉ RGPD — Route /api/chat
 * - Ne jamais logger le contenu des messages.
 * - Ne jamais stocker le texte utilisateur.
 * - Analytics (LOT 4) ne reçoit que métriques anonymes.
 * - Aucun console.log(messages), aucun log du body complet en prod.
 */

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY non configurée");
  return new OpenAI({ apiKey: key });
}

const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.4;
const TOP_P = 1;
const MAX_TOKENS = 120;
const CHAT_TIMEOUT_MS = 8000;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  meta?: { qtype?: QuestionType };
};

function toOpenAIMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

function jsonReply(payload: {
  reply: string;
  mode: ChatMode | "END_CHOICE" | "ENDED";
  meta?: { qtype?: QuestionType; endChoice?: boolean };
  session?: SessionMemory;
  resetSession?: boolean;
  shouldPause?: boolean;
}) {
  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { reply: "Configuration serveur manquante." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const rawMessages = (body.messages ?? []) as ChatMessage[];
    const singleMessage = typeof body.message === "string" ? body.message : null;
    const clientSession = body.session as SessionMemory | undefined;

    const messages: ChatMessage[] =
      rawMessages.length > 0
        ? rawMessages.filter(
            (m) =>
              m &&
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string"
          )
        : singleMessage
          ? [{ role: "user" as const, content: singleMessage }]
          : [];

    if (messages.length === 0) {
      return NextResponse.json(
        { reply: "Envoyez un message." },
        { status: 400 }
      );
    }

    const lastUserContent = getLastUserContent(messages);
    const norm = normalizeText(lastUserContent);
    const session = clientSession ?? buildSessionFromMessages(messages);
    const lastBodyZone = session.lastBodyZone ?? getLastBodyZoneFromMessages(messages);
    const repeatCounter = session.repeatCounter ?? getRepeatCounter(messages);
    const lastPromptType = session.lastPromptType ?? getLastPromptTypeFromMessages(messages);
    let avoid = avoidSetFromLast(messages);
    if (lastBodyZone) {
      avoid = new Set(avoid);
      avoid.add("DQ_LOCATION_CHOICE");
    }

    // ——— Fin explicite : arrêter / stop / termine / fin → ENDED, pas d'OpenAI ———
    if (detectEndIntention(norm)) {
      return jsonReply({
        reply: ENDED_REPLY,
        mode: "ENDED",
        resetSession: true,
        session: emptySession(),
      });
    }

    // ——— Une fois ENDED : ne plus jamais appeler le modèle ———
    if (session.state === "ENDED") {
      return jsonReply({
        reply: ENDED_REPLY,
        mode: "ENDED",
        session: emptySession(),
      });
    }

    // ——— Sécurité : auto-harm → réponse 112/3114 + END ———
    if (detectSelfHarm(norm)) {
      const { reply } = makeCrisisReply();
      return jsonReply({
        reply,
        mode: "ENDED",
        resetSession: true,
        session: { ...emptySession(), state: "ENDED" },
      });
    }

    // ——— Plainte répétition / insultes → END_CHOICE (Continuer / Terminer), pas "3 mots" ———
    if (detectRepetitionComplaint(norm)) {
      return jsonReply({
        reply: REPETITION_END_CHOICE_REPLY,
        mode: "END_CHOICE",
        meta: { endChoice: true },
        session: { ...session, state: "END_CHOICE" },
      });
    }

    // ——— "Je ne sens rien" → 2 phrases fixées, pas de question cognitive ———
    if (detectNothingFelt(norm)) {
      return NextResponse.json({
        reply: NOTHING_FELT_REPLY,
        mode: "ASK",
      });
    }

    // ——— Anti-répétition : lastPromptType identique 2 fois d'affilée → impasse END_CHOICE ———
    if (repeatCounter >= 2) {
      const res = makeStagnationImpasseReply();
      return jsonReply({
        reply: res.reply,
        mode: res.mode,
        meta: res.mode === "END_CHOICE" ? { endChoice: true } : undefined,
        session: { ...session, state: "END_CHOICE" },
      });
    }

    // LOT 6 : panique/détresse → réponse locale stabilisante (pas de 112).
    if (detectPanic(norm)) {
      const { reply, mode } = makePanicReply();
      return NextResponse.json({
        reply,
        mode,
        shouldPause: mode === "STABILIZE",
      });
    }

    const state = detectState(messages);

    // LOT 3 : ALLIANCE_REPAIR (après répétition, pour ne pas "3 mots" sur plainte).
    if (state === "ALLIANCE_REPAIR") {
      const { reply, mode } = makeAllianceReply(lastUserContent);
      return NextResponse.json({ reply, mode });
    }

    // LOT 4 : STAGNATION — zone 1% neutre seulement si overwhelm, jamais 2x de suite.
    if (state === "STAGNATION") {
      const allowNeutralZone =
        detectOverwhelm(lastUserContent) && lastPromptType !== "STAG_NEUTRAL_ZONE";
      const res = makeStagnationReply(lastUserContent, avoid, {
        allowNeutralZone,
      });
      return NextResponse.json({
        reply: res.reply,
        mode: res.mode,
        ...(res.meta && { meta: res.meta }),
        ...(res.mode === "END_CHOICE" && { meta: { ...res.meta, endChoice: true } }),
      });
    }

    const intent = detectSomaticIntent(lastUserContent);

    // STABILIZE : après micro-exploration somatique (dernier assistant = SOMATIC_*), courte pause.
    const lastQ = getLastAssistantQType(messages);
    const somaticQTypes: QuestionType[] = [
      "SOMATIC_QUALITY",
      "SOMATIC_MOVEMENT",
      "SOMATIC_SHAPE",
      "SOMATIC_BREATH",
    ];
    const cameFromSomatic =
      lastQ !== null && somaticQTypes.includes(lastQ);
    const shortReply = norm.length <= 40 && !intent.zone;
    if (state === "SOMATIC_ACTIVE" && cameFromSomatic && shortReply && intent.hasCue) {
      return NextResponse.json({
        reply: STABILIZE_REPLY,
        mode: "STABILIZE",
        shouldPause: true,
      });
    }

    // LOT 2 / 2B : SOMATIC_ACTIVE + zone + cue → micro-exploration (1 question : localisation/qualité/mouvement).
    if (state === "SOMATIC_ACTIVE" && intent.ok && intent.zone !== null) {
      const res = makeSomaticReply(intent.zone, lastUserContent, avoid);
      return NextResponse.json({
        reply: res.reply,
        mode: res.mode,
        ...(res.meta && { meta: res.meta }),
      });
    }

    // LOT 9bis : DefaultQuick — jamais "gorge/poitrine/ventre/nuque" si zone déjà donnée (avoid).
    if (isDefaultQuick(lastUserContent)) {
      const res = pickDefaultQuickReply(lastUserContent, avoid);
      return NextResponse.json({
        reply: res.reply,
        mode: res.mode,
        ...(res.meta && { meta: res.meta }),
      });
    }

    // LOT 12 : classifieur seulement si case1 (somatic typo recovery) ou case2 (message non trivial sans match local).
    const nonTrivial = norm.length >= 13;
    const case1 = shouldAskClassifierForSomatic(norm, intent.ok);
    const case2 = nonTrivial;
    const shouldClassify = case1 || case2;

    const defaultClassified: ClassifyResult = {
      state: "DEFAULT",
      confidence: 0,
      zone: null,
      cue: null,
    };
    let classified: ClassifyResult = defaultClassified;
    if (shouldClassify) {
      try {
        classified = await classifyLastUser(lastUserContent);
      } catch {
        classified = defaultClassified;
      }
    }
    if (
      classified.state === "SELF_HARM" &&
      !allowClassifierSelfHarm(norm, classified.state)
    ) {
      // SELF_HARM accepté uniquement en local → fall through DEFAULT
    } else if (
      classified.state === "PANIC" &&
      !allowClassifierPanic(norm, classified.state)
    ) {
      // Rumination mal classée en PANIC → fall through DEFAULT
    } else if (classified.state === "ALLIANCE_REPAIR") {
      const { reply, mode } = makeAllianceReply(lastUserContent);
      return NextResponse.json({ reply, mode });
    } else if (classified.state === "STAGNATION") {
      const allowNeutralZone =
        detectOverwhelm(lastUserContent) && lastPromptType !== "STAG_NEUTRAL_ZONE";
      const res = makeStagnationReply(lastUserContent, avoid, {
        allowNeutralZone,
      });
      return NextResponse.json({
        reply: res.reply,
        mode: res.mode,
        ...(res.meta && { meta: res.meta }),
        ...(res.mode === "END_CHOICE" && { meta: { ...res.meta, endChoice: true } }),
      });
    } else if (
      classified.state === "PANIC" &&
      allowClassifierPanic(norm, classified.state)
    ) {
      const { reply, mode } = makePanicReply(lastUserContent);
      return NextResponse.json({ reply, mode });
    } else if (
      classified.state === "SOMATIC_ACTIVE" &&
      classified.cue === true &&
      classified.zone
    ) {
      const zone = mapClassifierZoneToZone(classified.zone);
      if (zone !== null) {
        const res = makeSomaticReply(zone, lastUserContent, avoid);
        return NextResponse.json({
          reply: res.reply,
          mode: res.mode,
          ...(res.meta && { meta: res.meta }),
        });
      }
    }

    // LOT 12 : appel OpenAI chat avec timeout 8s ; en timeout/erreur → makeSafeAskReply (200).
    let reply: string;
    try {
      reply = await withTimeout(
        async (signal) => {
          const openai = getOpenAI();
          const response = await openai.chat.completions.create(
            {
              model: MODEL,
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                ...toOpenAIMessages(messages),
              ],
              temperature: TEMPERATURE,
              top_p: TOP_P,
              max_tokens: MAX_TOKENS,
            },
            { signal }
          );
          return response.choices[0]?.message?.content?.trim() ?? "";
        },
        CHAT_TIMEOUT_MS
      );
    } catch (err) {
      if (err instanceof Error && err.message === TIMEOUT_MESSAGE) {
        const safe = makeSafeAskReply(lastUserContent);
        return NextResponse.json({ reply: safe.reply, mode: safe.mode });
      }
      const safe = makeSafeAskReply(lastUserContent);
      return NextResponse.json({ reply: safe.reply, mode: safe.mode });
    }

    // Réponse stabilisation explicite → mode STABILIZE + pause (avant drift/trim).
    if (reply && /restez.*quelques.*instants/i.test(reply)) {
      const trimmed = truncateResponse(reply);
      return NextResponse.json({
        reply: trimmed || reply,
        mode: "STABILIZE",
        shouldPause: true,
      });
    }

    // LOT 12 : drift → fallbackSafe direct (pas de 2e appel OpenAI).
    if (hasDrift(reply)) {
      const safe = makeSafeAskReply(lastUserContent);
      return NextResponse.json({ reply: safe.reply, mode: safe.mode });
    }

    reply = truncateResponse(reply);

    if (!reply || !reply.trim()) {
      const safe = makeSafeAskReply(lastUserContent);
      return NextResponse.json({ reply: safe.reply, mode: safe.mode });
    }

    if (isForbiddenStyle(reply)) {
      const safe = makeSafeAskReply(lastUserContent);
      return NextResponse.json({ reply: safe.reply, mode: safe.mode });
    }

    const mode: ChatMode = detectModeFromReply(reply);
    const qtype = inferQTypeFromReply(reply);
    const lastQType = getLastAssistantQType(messages);
    if (lastQType !== null && qtype === lastQType) {
      const altAvoid = new Set([lastQType, ...avoid]);
      const alt = pickDefaultQuickReply("ok", altAvoid);
      return NextResponse.json({
        reply: alt.reply,
        mode: alt.mode,
        ...(alt.meta && { meta: alt.meta }),
      });
    }
    return NextResponse.json({
      reply,
      mode,
      ...(qtype && { meta: { qtype } }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown";
    console.error("[chat] Error:", message);
    return NextResponse.json(
      { reply: "Une erreur s'est produite.", mode: "ASK" as ChatMode },
      { status: 500 }
    );
  }
}
