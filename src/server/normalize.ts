/**
 * LOT 6 — Normalisation unique pour heuristiques (state, somatic, crisis).
 * Réduit faux négatifs : apostrophes typo, ligatures, accents, abréviations.
 */

/** Apostrophes typographiques → apostrophe ASCII. */
const TYPO_APOSTROPHE = /[''\u2018\u2019\u201A\u201B]/g;

/**
 * Normalise le texte avant matching (lowercase, apostrophes, ligatures, diacritiques, espaces).
 * - lower-case
 * - apostrophes typo (’ ‘) → '
 * - œ/Œ → oe
 * - diacritiques supprimés (NFD + strip \\p{M})
 * - espaces compactés
 * - " ds " / " d's " → " dans "
 */
export function normalizeText(input: string): string {
  if (input == null || typeof input !== "string") return "";
  let s = input.trim();
  if (!s) return "";
  s = s.toLowerCase();
  s = s.replace(TYPO_APOSTROPHE, "'");
  s = s.replace(/œ/g, "oe").replace(/Œ/g, "oe");
  s = s.normalize("NFD").replace(/\p{M}/gu, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\bds\b/g, "dans");
  s = s.replace(/\bd's\b/g, "dans");
  return s;
}
