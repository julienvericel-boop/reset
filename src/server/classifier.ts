/**
 * LOT 7 — Classifieur LLM minimal (uniquement pour étiqueter le dernier message user).
 * N'appelle OpenAI que si les heuristiques locales n'ont rien capté.
 * LOT 12 — Timeout 5s, fallback DEFAULT en erreur/timeout.
 */

import OpenAI from "openai";
import { withTimeout, TIMEOUT_MESSAGE } from "./openaiTimeout";

export type ClassifiedState =
  | "DEFAULT"
  | "ALLIANCE_REPAIR"
  | "STAGNATION"
  | "SOMATIC_ACTIVE"
  | "SELF_HARM"
  | "PANIC";

export type ClassifyResult = {
  state: ClassifiedState;
  confidence: number;
  zone: string | null;
  cue: boolean | null;
};

const VALID_STATES: ClassifiedState[] = [
  "DEFAULT",
  "ALLIANCE_REPAIR",
  "STAGNATION",
  "SOMATIC_ACTIVE",
  "SELF_HARM",
  "PANIC",
];

const CLASSIFIER_MODEL = "gpt-4o-mini";
const CLASSIFIER_MAX_TOKENS = 60;
const CLASSIFIER_TIMEOUT_MS = 5000;

const SYSTEM_PROMPT = `Vous êtes un classifieur. Répondez UNIQUEMENT en JSON strict, aucune phrase, aucun markdown.

Règles de classification (une seule catégorie par message) :
- ALLIANCE_REPAIR : attaque/insulte/frustration envers l'assistant (ex: "tu m'écoutes pas", "tu comprends rien", "t'es con", "oui et??", "écoute-moi", "tu te fous de moi").
- STAGNATION : impasse (ex: "ça sert à rien", "rien ne change", "toujours pareil", "et alors", "aucun changement").
- SELF_HARM : mention explicite suicide/auto-agression/mourir/se tuer/envie de se faire du mal.
- PANIC : panique/submergé/exploser/partir en vrille, SANS mention auto-agressive.
- SOMATIC_ACTIVE : localisation corporelle + sensation interne (ex: nuque/ventre/gorge/poitrine/mâchoire/dos + tension/serré/noeud/pression/lourd/raide/tendu). Tolérer fautes et abréviations.
- DEFAULT : aucun des cas ci-dessus.

Format de réponse strict (rien d'autre) :
{"state":"<STATE>","confidence":<0-1>,"zone":<string ou null>,"cue":<true|false|null>}
Pour SOMATIC_ACTIVE uniquement : zone = chaîne libre ("gorge","ventre","poitrine", etc.), cue = true si sensation interne détectée.
Pour les autres états : zone = null, cue = null.`;

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY non configurée");
  return new OpenAI({ apiKey: key });
}

/**
 * Classifie le dernier message user. JSON invalide ou état inconnu → DEFAULT, confidence 0.
 * LOT 12 : timeout 5s ; en TIMEOUT/erreur → fallback DEFAULT.
 */
export async function classifyLastUser(text: string): Promise<ClassifyResult> {
  const fallback: ClassifyResult = {
    state: "DEFAULT",
    confidence: 0,
    zone: null,
    cue: null,
  };

  if (!text || typeof text !== "string" || !text.trim()) {
    return fallback;
  }

  const userPrompt = `Classifie ce message utilisateur. Réponds UNIQUEMENT par un objet JSON (aucune phrase).

Message : "${text.replace(/"/g, '\\"').slice(0, 500)}"

JSON attendu : {"state":"...","confidence":0.0 à 1.0,"zone":null ou "nom_zone","cue":null ou true ou false}`;

  try {
    const result = await withTimeout(
      async (signal) => {
        const openai = getOpenAI();
        const response = await openai.chat.completions.create(
          {
            model: CLASSIFIER_MODEL,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
            temperature: 0,
            max_tokens: CLASSIFIER_MAX_TOKENS,
            response_format: { type: "json_object" },
          },
          { signal }
        );

        const raw = response.choices[0]?.message?.content?.trim();
        if (!raw) return fallback;

        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const state = parsed?.state as string | undefined;
        if (!state || !VALID_STATES.includes(state as ClassifiedState)) {
          return fallback;
        }

        const confidence = typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0;
        const zone = parsed.zone != null && typeof parsed.zone === "string"
          ? parsed.zone.trim() || null
          : null;
        const cue = parsed.cue === true ? true : parsed.cue === false ? false : null;

        return {
          state: state as ClassifiedState,
          confidence,
          zone,
          cue,
        };
      },
      CLASSIFIER_TIMEOUT_MS
    );
    return result;
  } catch (err) {
    if (err instanceof Error && err.message === TIMEOUT_MESSAGE) {
      return fallback;
    }
    return fallback;
  }
}
