/**
 * LOT 7 — Réponse locale panique (stabilisation courte, pas 112).
 */

export type PanicResult = { reply: string; mode: "STABILIZE" };

const PANIC_REPLY =
  "Ok. Juste 10 secondes : sentez l'air qui sort à l'expiration. Est-ce que ça baisse d'1 % ?";

/**
 * Réponse déterministe, 1–2 phrases, < 300 car, pas 112, pas médical. Max 1 "?".
 */
export function makePanicReply(_text?: string): PanicResult {
  return { reply: PANIC_REPLY, mode: "STABILIZE" };
}
