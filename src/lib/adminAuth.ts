/**
 * LOT 4 — Vérification token admin (MVP, pas de login).
 */

export function isAdminToken(token: string | null | undefined): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || typeof expected !== "string") return false;
  return token === expected;
}
