/**
 * LOT 9bis — DefaultQuick : réponses locales pour entrées ultra courtes (seuil strict).
 * Ne court-circuite pas DEFAULT pour des formulations ambiguës.
 */

import { normalizeText } from "@/server/normalize";
import type { QuestionType } from "@/server/qtype";

export type { QuestionType };

export type DefaultQuickResult = {
  reply: string;
  mode: "ASK";
  meta?: { qtype: QuestionType };
};

const MAX_NORMALIZED_LEN = 12;

const ALLOWED_STRICT = new Set([
  "ok",
  "okay",
  "…",
  "...",
  "help",
  "aide",
  "j'aide",
  "je sais pas",
  "jsp",
  "?",
  "hein",
]);

/** Mots considérés comme stopwords pour le décompte "> 2 mots non stopwords". */
const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "ou", "mais",
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "ce", "ca",
  "pas", "ne", "en", "y", "a", "est", "sont", "suis", "es", "sommes", "etes",
  "ai", "as", "avons", "avez", "ont", "m", "l", "d", "n", "s", "j", "t",
]);

function countNonStopwords(normalized: string): number {
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.filter((w) => !STOPWORDS.has(w)).length;
}

/**
 * true seulement si :
 * - length(normalized) <= 12
 * - ET (normalized dans set OU patterns très stricts)
 * - ET pas plus de 2 mots non stopwords (évite court-circuit).
 */
export function isDefaultQuick(text: string): boolean {
  if (text == null || typeof text !== "string") return false;
  const normalized = normalizeText(text);
  if (normalized.length > MAX_NORMALIZED_LEN) return false;
  if (countNonStopwords(normalized) > 2) return false;
  if (ALLOWED_STRICT.has(normalized)) return true;
  if (/^\.\.\.+$/.test(normalized) || /^[…]+$/.test(normalized)) return true;
  if (/^\s*\?\s*$/.test(normalizeText(text.trim()))) return true;
  return false;
}

/** Hash déterministe (entier) pour sélection de template. */
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

const TEMPLATES: { qtype: QuestionType; reply: string }[] = [
  {
    qtype: "DQ_HEAD_BODY",
    reply: "Ok. C'est surtout dans la tête, dans le corps, ou les deux ?",
  },
  {
    qtype: "DQ_INTENSITY",
    reply: "Ok. Intensité là, de 1 à 5 ?",
  },
  {
    qtype: "DQ_ONE_WORD",
    reply: "Ok. Un seul mot pour ce qui est là ?",
  },
  {
    qtype: "DQ_LOCATION_CHOICE",
    reply:
      "Ok. Où ça serre le plus : gorge, poitrine, ventre ou nuque ?",
  },
  {
    qtype: "DQ_ANCHOR",
    reply: "Ok. En une phrase : qu'est-ce qui tourne le plus là ?",
  },
];

/**
 * Choisit un template déterministe selon le texte, en évitant les qtypes dans avoid.
 * Garantit reply <= 300 car, max 1 '?'.
 */
export function pickDefaultQuickReply(
  text: string,
  avoid?: Set<QuestionType>
): DefaultQuickResult {
  const normalized = normalizeText(text);
  const candidates = avoid?.size
    ? TEMPLATES.filter((t) => !avoid.has(t.qtype))
    : [...TEMPLATES];
  const pool = candidates.length > 0 ? candidates : TEMPLATES;
  const idx = stableHash(normalized || "ok") % pool.length;
  const chosen = pool[idx];
  return {
    reply: chosen.reply,
    mode: "ASK",
    meta: { qtype: chosen.qtype },
  };
}
