/**
 * Machine d'état protocole MVP — ordre immuable.
 * REFLECT → BODY_ORIENT → STABILIZE → CHECK → END_CHOICE → ENDED
 * Session dérivée des messages (pas de DB).
 */

import { normalizeText } from "./normalize";
import type { QuestionType } from "./qtype";
import { detectSomaticZone } from "./somatic";

export type ProtocolState =
  | "REFLECT"
  | "BODY_ORIENT"
  | "STABILIZE"
  | "CHECK"
  | "END_CHOICE"
  | "ENDED";

export type SessionMemory = {
  state: ProtocolState;
  lastBodyZone: string | null;
  lastPromptType: QuestionType | null;
  repeatCounter: number;
};

/** Ne pas matcher "n'arrête pas" (rumination). Phrases explicites de fin uniquement. */
const END_INTENTION_PATTERNS: RegExp[] = [
  /\bje\s+veux\s+arreter\b/i,
  /\bje\s+veux\s+terminer\b/i,
  /\bon\s+arrete\b/i,
  /\bstop\b/i,
  /\btermine\b/i,
  /\bfinir\b/i,
  /\bc'est\s+tout\b/i,
  /^(fin|arrete|termine)\s*[.!?]*$/i,
];

/** Détecte intention de fin (arrêter, stop, termine, fin). */
export function detectEndIntention(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const norm = normalizeText(text);
  if (!norm) return false;
  return END_INTENTION_PATTERNS.some((re) => re.test(norm));
}

const REPETITION_COMPLAINT_PATTERNS: RegExp[] = [
  /\bca\s+tourne\s+en\s+rond\b/i,
  /\barrete\s+de\s+te\s+repeter\b/i,
  /\barrete\s+de\s+te\s+répéter\b/i,
  /\btu\s+te\s+repètes?\b/i,
  /\btu\s+te\s+répètes?\b/i,
  /\bmeme\s+question\b/i,
  /\bmême\s+question\b/i,
  /\btoujours\s+la\s+meme\b/i,
  /\b(tu\s+es|t'es)\s+nul(le)?\b/i,
  /\bdegage\b/i,
  /\bcon\b/i,
  /\bidiote?\b/i,
];

/** "ça tourne en rond", "arrête de te répéter", insultes → END_CHOICE. */
export function detectRepetitionComplaint(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const norm = normalizeText(text);
  if (!norm) return false;
  return REPETITION_COMPLAINT_PATTERNS.some((re) => re.test(norm));
}

const NOTHING_FELT_PATTERNS: RegExp[] = [
  /\bje\s+ne\s+sens\s+rien\b/i,
  /\brien\s+du\s+tout\b/i,
  /\bje\s+sens\s+rien\b/i,
  /\baucune\s+sensation\b/i,
];

/** "Je ne sens rien" / "rien du tout" → réponse normaliser + corps (pas cognitif). */
export function detectNothingFelt(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const norm = normalizeText(text);
  if (!norm) return false;
  return NOTHING_FELT_PATTERNS.some((re) => re.test(norm));
}

/** Réponse fixe "je ne sens rien" : 2 phrases max, pas de question cognitive. */
export const NOTHING_FELT_REPLY =
  "C'est fréquent au début. Regardez simplement : mâchoire, épaules, poitrine ou ventre — y a-t-il une zone un peu plus tendue ?";

/** Réponse END_CHOICE pour plainte de répétition / insultes. */
export const REPETITION_END_CHOICE_REPLY =
  "D'accord, on peut arrêter ici pour le moment.";

/** Message de fin sobre (ENDED). */
export const ENDED_REPLY =
  "On s'arrête là. Revenez quand vous voulez.";

/** Réponse END_CHOICE (Continuer / Terminer). */
export const END_CHOICE_REPLY =
  "Voulez-vous continuer ou terminer pour le moment ?";

/** Réponse CHECK (plus calme ?). */
export const CHECK_REPLY =
  "Est-ce un peu plus calme qu'au début ?";

/** Réponse STABILIZE (pause 8–10 s). */
export const STABILIZE_REPLY =
  "Restez quelques instants avec cette sensation.";

/** Réponse BODY_ORIENT (invite non interrogative). */
export const BODY_ORIENT_REPLY =
  "Remarquez où cela se sent dans votre corps.";

/**
 * Dérive lastBodyZone depuis l'historique : dernier message user contenant une zone.
 */
export function getLastBodyZoneFromMessages(
  messages: { role: string; content: string }[]
): string | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user" && typeof m.content === "string") {
      const zone = detectSomaticZone(m.content);
      if (zone) return zone;
    }
  }
  return null;
}

/**
 * Compte combien de fois de suite le dernier qtype assistant a été répété.
 */
export function getRepeatCounter(
  messages: { role: string; content: string; meta?: { qtype?: QuestionType } }[]
): number {
  if (!Array.isArray(messages) || messages.length < 2) return 0;
  let count = 0;
  let lastQ: QuestionType | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "assistant" && m.meta?.qtype) {
      if (lastQ === null) lastQ = m.meta.qtype;
      if (m.meta.qtype === lastQ) count++;
      else break;
    }
  }
  return count;
}

/**
 * Dernier qtype assistant dans l'historique.
 */
export function getLastPromptTypeFromMessages(
  messages: { role: string; content: string; meta?: { qtype?: QuestionType } }[]
): QuestionType | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "assistant" && m.meta?.qtype) return m.meta.qtype;
  }
  return null;
}

/**
 * Initialise ou met à jour la session à partir des messages.
 * state est soit envoyé par le client soit inféré (simplifié : on ne stocke pas l'état séquentiel côté serveur sans client, donc on dérive lastBodyZone, lastPromptType, repeatCounter des messages).
 */
export function buildSessionFromMessages(
  messages: { role: string; content: string; meta?: { qtype?: QuestionType } }[],
  clientState?: ProtocolState | null
): SessionMemory {
  const lastBodyZone = getLastBodyZoneFromMessages(messages);
  const lastPromptType = getLastPromptTypeFromMessages(messages);
  const repeatCounter = getRepeatCounter(messages);
  const state = clientState ?? "REFLECT";
  return {
    state,
    lastBodyZone,
    lastPromptType,
    repeatCounter,
  };
}

/** Session vide (reset). */
export function emptySession(): SessionMemory {
  return {
    state: "REFLECT",
    lastBodyZone: null,
    lastPromptType: null,
    repeatCounter: 0,
  };
}

/** User dit "insupportable" / "trop" / "je peux pas" → autoriser proposition zone 1% neutre. */
const OVERWHELM_PATTERNS: RegExp[] = [
  /\binsupportable\b/i,
  /\btrop\s+(dur|fort|intense)\b/i,
  /\bje\s+peux\s+pas\b/i,
  /\bj'y\s+arrive\s+pas\b/i,
  /\bc'est\s+trop\b/i,
];

export function detectOverwhelm(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const norm = normalizeText(text);
  if (!norm) return false;
  return OVERWHELM_PATTERNS.some((re) => re.test(norm));
}
