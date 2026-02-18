/**
 * Garde-fous réponse IA — côté serveur uniquement.
 * LOT 8 — isForbiddenStyle pour fallback safe (pas de reroll OpenAI).
 */

import { normalizeText } from "@/server/normalize";

const MAX_CHARS = 300;
const MAX_SENTENCES = 2;

/** Abréviations à ne pas considérer comme fin de phrase (etc., M., Dr., …). */
const ABBREV_SUFFIX = /(?:etc|M|Dr|Mme|Mr|Mlle|Mmes|Mrs)\.\s*$/i;

/**
 * Tronque à 300 caractères puis au plus 2 phrases.
 * - Split sur [.!?] suivi d'un espace ou fin de chaîne.
 * - Ignore les abréviations (etc., M., Dr.).
 * - Si aucune ponctuation détectée : applique uniquement la limite de 300 caractères.
 */
export function truncateResponse(text: string): string {
  if (!text || typeof text !== "string") return "";
  let out = text.trim();
  if (out.length > MAX_CHARS) {
    const truncated = out.slice(0, MAX_CHARS);
    const re = /[.!?]+(\s|$)/g;
    let match: RegExpExecArray | null;
    let lastEnd = -1;
    let lastLen = 0;
    while ((match = re.exec(truncated)) !== null) {
      lastEnd = match.index;
      lastLen = match[0].length;
    }
    out =
      lastEnd >= 0
        ? truncated.slice(0, lastEnd + lastLen).trim()
        : truncated;
  }
  return limitSentences(out, MAX_SENTENCES);
}

/**
 * Garde au plus `max` phrases.
 * Phrase = [^.!?]+[.!?]+(\s|$) ; si aucune ponctuation, tout est une seule phrase (limite 300 déjà appliquée).
 */
function limitSentences(text: string, max: number): string {
  const segments = text.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (!segments || segments.length === 0) return text.trim();

  const merged: string[] = [];
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (merged.length > 0 && ABBREV_SUFFIX.test(merged[merged.length - 1].trim())) {
      merged[merged.length - 1] += seg;
    } else {
      merged.push(seg);
    }
  }

  const toReturn = merged.length <= max ? merged : merged.slice(0, max);
  return toReturn
    .map((s) => s.trim())
    .join(" ")
    .trim();
}

const DRIFT_PATTERNS = [
  /\bpourquoi\b/i,
  /\bje\s+pense\b/i,
  /\bvous\s+devriez\b/i,
  /\bvous\s+devez\b/i,
  /\bje\s+vous\s+(conseille|suggère|recommande)\b/i,
  /\bconseil\s*:/i,
  /\bessayez\s+de\s+/i,
  /\bil\s+faut\s+/i,
  /** Réponse vague / soft → déclencher second appel renforcé (sans remplacer le prompt principal). */
  /\bil\s+semble\s+que\b/i,
  /\bpréoccupation\b/i,
];

/**
 * Détecte dérive (conseil, pourquoi, réponse vague) → à relancer avec second appel renforcé.
 */
export function hasDrift(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();
  return DRIFT_PATTERNS.some((re) => re.test(lower));
}

/** LOT 8 — Patterns interdits (style) → déclencher fallbackSafe, pas de 2e appel OpenAI. Sur texte normalisé. */
const FORBIDDEN_STYLE_PATTERNS: RegExp[] = [
  /c'?est\s+normal\b/,
  /c'?est\s+frequent\b/,
  /vous\s+devriez/,
  /\bil\s+faut\b/,
  /essayez\s+de\b/,
  /je\s+pense\b/,
  /il\s+semble\b/,
  /consultez\b/,
  /professionnel\s+de\s+sante\b/,
];

/**
 * Reply contient un style interdit (normalisation appliquée). → utiliser makeSafeAskReply, pas de reroll.
 */
export function isForbiddenStyle(reply: string): boolean {
  if (!reply || typeof reply !== "string") return false;
  const norm = normalizeText(reply);
  if (!norm) return false;
  return FORBIDDEN_STYLE_PATTERNS.some((re) => re.test(norm));
}
