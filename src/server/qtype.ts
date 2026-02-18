/**
 * LOT 9bis — Types de question pour anti-répétition (catégories).
 * Utilisé par defaultQuick et par l’inférence sur réponses OpenAI.
 */

export type QuestionType =
  | "DQ_ANCHOR"
  | "DQ_INTENSITY"
  | "DQ_ONE_WORD"
  | "DQ_HEAD_BODY"
  | "DQ_LOCATION_CHOICE"
  | "RP_TIME"
  | "RP_MODALITY"
  | "ED_LABEL"
  | "ED_LOCATION"
  | "SOMATIC_QUALITY"
  | "SOMATIC_MOVEMENT"
  | "SOMATIC_SHAPE"
  | "SOMATIC_BREATH"
  | "STAG_TWO_WORDS"
  | "STAG_NEUTRAL_ZONE"
  | "STAG_CHOICE"
  | "GENERIC_ASK";

export type ChatMessageWithMeta = {
  role: "user" | "assistant";
  content: string;
  meta?: { qtype?: QuestionType };
};

/**
 * Parcourt depuis la fin, renvoie le qtype du dernier message assistant ayant meta?.qtype.
 */
export function getLastAssistantQType(
  messages: ChatMessageWithMeta[]
): QuestionType | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "assistant" && m.meta?.qtype) return m.meta.qtype;
  }
  return null;
}

/**
 * Set des qtypes à éviter (répétition immédiate) : uniquement le dernier.
 */
export function avoidSetFromLast(
  messages: ChatMessageWithMeta[]
): Set<QuestionType> {
  const last = getLastAssistantQType(messages);
  if (!last) return new Set();
  return new Set([last]);
}

/**
 * Heuristique simple pour déduire le qtype d’une réponse OpenAI (éviter répétition).
 * LOT 11 — + SOMATIC_* et STAG_*.
 */
export function inferQTypeFromReply(reply: string): QuestionType {
  if (!reply || typeof reply !== "string") return "GENERIC_ASK";
  const lower = reply.toLowerCase();
  if (/\bintensite\b|0\s*[-–]\s*10|1\s+a\s+5|1\s+à\s+5/.test(lower))
    return "DQ_INTENSITY";
  if (
    /ou\s+ca\b|où\s+ça\b/.test(lower) &&
    /gorge|poitrine|ventre|nuque/.test(lower)
  )
    return "DQ_LOCATION_CHOICE";
  if (/\bimage\b|\bmots\b|\bsensation\b/.test(lower)) return "RP_MODALITY";
  if (
    /\bdepuis\s+combien\b|\bmoment\s+de\s+la\s+journee\b|\bmoment\s+de\s+la\s+journée\b/.test(
      lower
    )
  )
    return "RP_TIME";
  if (
    /\bserr(e|ee|es?)\b|\blourd\b|\bchaud\b|\bbrulant\b|\bengourdi\b|\bblocage\b/.test(
      lower
    )
  )
    return "SOMATIC_QUALITY";
  if (/\bpulse\b|\bvibre\b|\bbouge\b|\bfige\b|\bimmobile\b|\bfixe\b/.test(lower))
    return "SOMATIC_MOVEMENT";
  if (/\bpoint\b|\bbarre\b|\bbande\b|\bzone\s+(plus\s+)?large\b|\bzone\s+diffuse\b/.test(lower))
    return "SOMATIC_SHAPE";
  if (/\bexpire\b|\bsoufflant\b|\bexpiration\b/.test(lower))
    return "SOMATIC_BREATH";
  if (/decrivez\s+la\s+sensation\s+en\s+2\s+mots/.test(lower))
    return "STAG_TWO_WORDS";
  if (/zone\s+1%?\s+plus\s+neutre|\bneutre\b.*\bzone\b/.test(lower))
    return "STAG_NEUTRAL_ZONE";
  if (/vous\s+preferez\b|vous\s+préferez\b|\.\.\.\s+ou\s+\.\.\./.test(lower))
    return "STAG_CHOICE";
  return "GENERIC_ASK";
}
