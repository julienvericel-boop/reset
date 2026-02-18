/**
 * LOT 1 — Moteur d'états minimal côté serveur.
 * LOT 6 — Heuristiques appliquées sur texte normalisé (normalizeText).
 */

import { normalizeText } from "./normalize";

export type State =
  | "DEFAULT"
  | "ALLIANCE_REPAIR"
  | "SOMATIC_ACTIVE"
  | "STAGNATION";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Dernier message user et dernier assistant (en parcourant de la fin). */
function getLastUserAndAssistant(
  messages: ChatMessage[]
): { lastUser: string; lastAssistant: string } {
  let lastUser = "";
  let lastAssistant = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user" && typeof m.content === "string" && !lastUser) {
      lastUser = m.content.trim();
    }
    if (
      m?.role === "assistant" &&
      typeof m.content === "string" &&
      !lastAssistant
    ) {
      lastAssistant = m.content.trim();
    }
    if (lastUser && lastAssistant) break;
  }
  return { lastUser, lastAssistant };
}

/** Heuristiques : user attaque / se sent pas écouté. Entrée = texte déjà normalisé. */
function isAllianceRepair(normalized: string): boolean {
  const patterns = [
    /\btu\s*m'\s*ecoutes?\s+pas\b/,
    /\bt'\s*ecoutes?\s+pas\b/,
    /\btu\s*m'\s*ecoutes?\b/,
    /oui\s+et\s*\?*\s*$/,
    /\btu\s*m'\s*entends?\s+pas\b/,
    /\bt'\s*entends?\s+pas\b/,
    /\btu\s+comprends?\s+(pas|rien)\b/,
    /ecoute\s*[- ]?moi\b/,
    /\btu\s+fais\s+rien\b/,
    /ca\s+aide\s+pas\b/,
    /\bt'es\s+nul(le)?\b/,
    /\b(il|tu)\s+faut\s+(que\s+)?tu\s+m'\s*ecoutes?\b/,
    /\btu\s+te\s+fous\s+de\s+moi\b/,
  ];
  return patterns.some((re) => re.test(normalized));
}

/** Heuristiques : user a nommé une zone corporelle. Entrée = texte déjà normalisé. */
function isSomaticActive(normalized: string): boolean {
  const zones = [
    /\b(poitrine|ventre|gorge|epaules|machoire)\b/,
    /\b(dos|nuque|estomac|front|joues)\b/,
    /\bdans\s+(la\s+)?(poitrine|gorge|machoire)\b/,
    /\bdans\s+(le\s+)?(ventre|dos|corps)\b/,
    /\b(a|aux?)\s+(la\s+)?(gorge|poitrine|nuque)\b/,
    /\b(a|aux?)\s+(les\s+)?(epaules|joues)\b/,
    /\btension\s+(dans|a)\s+/,
    /\b(ca\s+)?(se\s+)?sent\s+(dans|a)\s+/,
    /\bserre\s+(dans|a)\s+/,
  ];
  return zones.some((re) => re.test(normalized));
}

/** Heuristiques : user dit que ça ne change rien / inutile. Entrée = texte déjà normalisé. */
function isStagnation(normalized: string): boolean {
  const patterns = [
    /ca\s+sert\s+a\s+rien\b/,
    /\bet\s+alors\s*\??\s*$/,
    /\baucun\s+changement\b/,
    /ca\s+(ne\s+)?change\s+rien\b/,
    /\btoujours\s+pareil\b/,
    /\brien\s+ne\s+change\b/,
    /\btoujours\s+pas\s+(mieux)?\b/,
    /\b(pareil|identique)\s*\.?\s*$/,
  ];
  return patterns.some((re) => re.test(normalized));
}

/** LOT 11 — Marqueurs rumination : ne pas classer en STAGNATION ("ça tourne" ≠ impasse). */
const RUMINATION_MARKER_PATTERNS: RegExp[] = [
  /\bje\s+pense\b/,
  /\bje\s+rumine\b/,
  /\bca\s+tourne\b/,
  /\btourne\s+en\s+boucle\b/,
  /\bobsede\b/,
  /\bscenarios\b/,
  /\bj'?\s*arrete\s+pas\s+de\s+penser\b/,
];

export function isRuminationMarker(normalized: string): boolean {
  if (!normalized || typeof normalized !== "string") return false;
  return RUMINATION_MARKER_PATTERNS.some((re) => re.test(normalized));
}

/** Dernier message user (pour LOT 2 : zone somatique sur lastUser). */
export function getLastUserContent(messages: ChatMessage[]): string {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  return getLastUserAndAssistant(messages).lastUser;
}

/**
 * Détecte l'état courant à partir de l'historique.
 * Priorité : ALLIANCE_REPAIR > STAGNATION > SOMATIC_ACTIVE > DEFAULT.
 */
export function detectState(messages: ChatMessage[]): State {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "DEFAULT";
  }

  const { lastUser } = getLastUserAndAssistant(messages);
  if (!lastUser) return "DEFAULT";

  const norm = normalizeText(lastUser);
  if (isAllianceRepair(norm)) return "ALLIANCE_REPAIR";
  if (isStagnation(norm) && !isRuminationMarker(norm)) return "STAGNATION";
  if (isSomaticActive(norm)) return "SOMATIC_ACTIVE";

  return "DEFAULT";
}
