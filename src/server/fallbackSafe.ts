/**
 * LOT 8 — Réponse safe déterministe quand la reply OpenAI est interdite ou vide.
 * Pas de second appel OpenAI.
 */

export type SafeAskResult = { reply: string; mode: "ASK" };

/** Fallback sobre, orienté corps (pas de question cognitive). */
const SAFE_ASK_REPLY =
  "Remarquez où cela se sent dans votre corps.";

/**
 * Réponse ultra courte, sans mots interdits, 1 question max. Déterministe.
 */
export function makeSafeAskReply(_userText?: string): SafeAskResult {
  return { reply: SAFE_ASK_REPLY, mode: "ASK" };
}
