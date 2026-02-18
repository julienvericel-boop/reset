/**
 * LOT 6 — Réponse locale crise (auto-agression explicite).
 * Ne pas confondre avec panique/détresse (pas de 112 automatique).
 */

import { normalizeText } from "./normalize";

export type CrisisResult = { reply: string; mode: "STABILIZE" };

/** Patterns explicites ou implicites auto-harm (texte normalisé). */
const SELF_HARM_PATTERNS: RegExp[] = [
  /envie\s+de\s+me\s+faire\s+du\s+mal/,
  /envie\s+de\s+disparaitre/,
  /faire\s+une\s+connerie/,
  /me\s+faire\s+du\s+mal/,
  /je\s+veux\s+mourir/,
  /je\s+vais\s+me\s+suicider/,
  /\bsuicide\b/,
  /me\s+tuer/,
];

/**
 * Détecte une intention explicite d'auto-agression (sur texte normalisé).
 */
export function detectSelfHarm(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const norm = normalizeText(text);
  if (!norm) return false;
  return SELF_HARM_PATTERNS.some((re) => re.test(norm));
}

/** Réponse courte + orientation aide immédiate France (spec). */
const CRISIS_REPLY =
  "Je suis désolé que ce soit aussi dur. Si vous risquez de vous faire du mal, appelez le 112 ou le 3114 (France) tout de suite, ou un proche.";

export function makeCrisisReply(): CrisisResult {
  return { reply: CRISIS_REPLY, mode: "STABILIZE" };
}

/** LOT 6 — Panique/détresse (sans 112). Détection locale ; réponse dans panic.ts. */
const PANIC_PATTERNS: RegExp[] = [
  /je\s+suis\s+en\s+panique/,
  /suis\s+en\s+panique/,
  /en\s+panique\b/,
  /je\s+panique\b/,
  /trop\s+anxieux/,
  /trop\s+angoiss/,
];

export function detectPanic(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const norm = normalizeText(text);
  if (!norm) return false;
  return PANIC_PATTERNS.some((re) => re.test(norm));
}

/** LOT 10 — Marqueurs stricts pour accepter PANIC venant du classifieur (éviter faux positifs rumination). */
const PANIC_MARKER_PATTERNS: RegExp[] = [
  /\bpanique\b/,
  /\bje\s+panique\b/,
  /\bangoisse\b/,
  /\banxieux\b/,
  /\banxieuse\b/,
  /\btrop\s+anxieux\b/,
  /\btrop\s+angoisse\b/,
  /\bcrise\s+d'?angoisse\b/,
];

/**
 * LOT 10 — Le texte normalisé contient au moins un marqueur panic explicite.
 */
export function hasPanicMarker(normText: string): boolean {
  if (!normText || typeof normText !== "string") return false;
  return PANIC_MARKER_PATTERNS.some((re) => re.test(normText));
}

/**
 * LOT 10 — Accepter la sortie PANIC du classifieur seulement si marqueur panic présent.
 */
export function allowClassifierPanic(
  normText: string,
  classifiedState: string
): boolean {
  return classifiedState === "PANIC" && hasPanicMarker(normText);
}

/**
 * LOT 10 — SELF_HARM doit être local uniquement (detectSelfHarm). Ignorer SELF_HARM du classifieur.
 */
export function allowClassifierSelfHarm(
  _normText: string,
  classifiedState: string
): boolean {
  return false; // SELF_HARM accepté uniquement via detectSelfHarm (local)
}
