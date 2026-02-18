/**
 * LOT 5 / LOT 8 — Détection du mode à partir de la reply (flux OpenAI ou fallback).
 * Utilise normalizeText pour cohérence. REPAIR n'est jamais déduit ici.
 */

import { normalizeText } from "./normalize";

export type ChatMode = "ASK" | "REPAIR" | "STABILIZE";

/** Patterns stricts sur texte normalisé (ascii, lowercase). */
const STABILIZE_PATTERNS: RegExp[] = [
  /restez\s+quelques\s+instants/,
  /restez\s+un\s+instant/,
  /laissez\s+cette\s+zone/,
  /laissez\s+cela\s+etre\s+la/,
  /gardez\s+l'?attention/,
  /pendant\s+quelques\s+secondes/,
  /10\s+secondes/,
];

/**
 * Détermine le mode à partir du texte de la reply.
 * REPAIR n'est jamais déduit ici (réponses locales uniquement).
 */
export function detectModeFromReply(reply: string): "ASK" | "STABILIZE" {
  if (!reply || typeof reply !== "string") return "ASK";
  const norm = normalizeText(reply);
  if (!norm) return "ASK";
  if (STABILIZE_PATTERNS.some((re) => re.test(norm))) return "STABILIZE";
  return "ASK";
}
