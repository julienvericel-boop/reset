/**
 * LOT 2 — Micro-guidage somatique local (sans OpenAI).
 * LOT 6 — detectSomaticIntent reçoit le texte brut ; normalisation interne avant zone/cue.
 * LOT 11 — anti-répétition (avoid qtype), fuzzy cues, meta.qtype.
 */

import { normalizeText } from "./normalize";
import type { QuestionType } from "./qtype";

export type Zone =
  | "NUQUE_CERVICALES"
  | "EPAULES"
  | "GORGE"
  | "POITRINE"
  | "VENTRE"
  | "MACHOIRE"
  | "DOS"
  | "TETE"
  | "MAINS"
  | "JAMBES";

/** Paires [pattern, zone]. Entrée = texte normalisé (ascii). Ordre = plus spécifique en premier. */
const ZONE_PATTERNS: [RegExp, Zone][] = [
  [/cervicale?s?\b/i, "NUQUE_CERVICALES"],
  [/nuque\b/i, "NUQUE_CERVICALES"],
  [/gorge\b/i, "GORGE"],
  [/poitrine\b/i, "POITRINE"],
  [/thorax\b/i, "POITRINE"],
  [/ventre\b/i, "VENTRE"],
  [/estomac\b/i, "VENTRE"],
  [/epaules?\b/i, "EPAULES"],
  [/machoire\b/i, "MACHOIRE"],
  [/dos\b/i, "DOS"],
  [/tete\b/i, "TETE"],
  [/crane\b/i, "TETE"],
  [/mains?\b/i, "MAINS"],
  [/jambes?\b/i, "JAMBES"],
];

/** Détecte une zone corporelle. Normalise en entrée pour cohérence (ds→dans, accents, etc.). */
export function detectSomaticZone(text: string): Zone | null {
  if (!text || typeof text !== "string") return null;
  const norm = normalizeText(text);
  if (!norm) return null;
  const lower = norm.toLowerCase();
  for (const [re, zone] of ZONE_PATTERNS) {
    if (re.test(lower)) return zone;
  }
  return null;
}

/**
 * LOT 2B — Indices de sensation interne (somatisation émotionnelle).
 * "mal", "douleur", "j'ai mal" ne sont PAS des cues (éviter douleur mécanique).
 * Pas de \b devant caractères accentués.
 */
/** Cues sur texte normalisé (nœud→noeud, serré→serre, etc.). LOT 6: tendu/tendue, raide. */
const INTERNAL_CUE_PATTERNS: RegExp[] = [
  /\btension\b/i,
  /serr(e|ee|es?)/i,
  /\bpression\b/i,
  /appuie\b/i,
  /oppressant/i,
  /noeud\b/i,
  /\bboule\b/i,
  /\bblocage\b/i,
  /contracte\b/i,
  /crispe\b/i,
  /brul(e|ant|ante)/i,
  /engourdi/i,
  /engourdie/i,
  /ca se sent/i,
  /je sens\b/i,
  /\blourd\b/i,
  /\blourde\b/i,
  /\btendu[e]?\b/i,
  /\braide\b/i,
];

/** Détecte un indice de sensation interne. Normalise en entrée. */
export function hasInternalCue(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const norm = normalizeText(text);
  if (!norm) return false;
  return INTERNAL_CUE_PATTERNS.some((re) => re.test(norm.toLowerCase()));
}

/** LOT 11 — Cues de référence pour fuzzy (typos fréquentes). */
const CUE_REFERENCE_WORDS = ["tension", "serre", "pression", "noeud"];
const MAX_CUE_WORD_LEN = 8;
const MAX_TOKENS_FUZZY = 20;

/** Distance de Levenshtein limitée (mots courts, max 8 chars). */
function levenshtein(a: string, b: string): number {
  if (a.length > MAX_CUE_WORD_LEN || b.length > MAX_CUE_WORD_LEN) return 999;
  const n = a.length;
  const m = b.length;
  const d: number[][] = [];
  for (let i = 0; i <= n; i++) d[i] = [i];
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[n][m];
}

/**
 * LOT 11 — Cue avec typos : un mot à distance Levenshtein ≤ 1 d’un cue (tension, serre, pression, noeud).
 * Limité aux mots ≤ 8 caractères, max 20 tokens.
 */
export function hasInternalCueFuzzy(normText: string): boolean {
  if (!normText || typeof normText !== "string") return false;
  const tokens = normText
    .toLowerCase()
    .replace(/[.,;:!?]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TOKENS_FUZZY);
  for (const token of tokens) {
    if (token.length > MAX_CUE_WORD_LEN) continue;
    for (const ref of CUE_REFERENCE_WORDS) {
      if (levenshtein(token, ref) <= 1) return true;
    }
  }
  return false;
}

export type SomaticIntent = {
  zone: Zone | null;
  hasCue: boolean;
  ok: boolean;
};

/**
 * LOT 2B — Intention somatique : zone + indice interne.
 * LOT 6 — Normalisation appliquée en entrée (ds→dans, nœud→noeud, accents, etc.).
 */
export function detectSomaticIntent(text: string): SomaticIntent {
  const zone = detectSomaticZone(text);
  const hasCue = hasInternalCue(text);
  return {
    zone,
    hasCue,
    ok: zone !== null && hasCue,
  };
}

/** LOT 10 — Faut-il appeler le classifieur pour rattraper une zone (typo) ? Cue présent mais zone locale non reconnue. */
const MIN_LEN_FOR_SOMATIC_RECOVERY = 8;

export function shouldAskClassifierForSomatic(
  normText: string,
  intentOk: boolean
): boolean {
  if (!normText || typeof normText !== "string") return false;
  const hasCue = hasInternalCue(normText) || hasInternalCueFuzzy(normText);
  return (
    hasCue && !intentOk && normText.length >= MIN_LEN_FOR_SOMATIC_RECOVERY
  );
}

/** Hash simple déterministe sur la chaîne (pour choisir l'axe sans randomness). */
function stableHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Micro-exploration : 1 seule question max. Localisation, qualité, mouvement (spec MVP). */
const MICRO_LOCALISATION = [
  "Plutôt centre ou bord ?",
];
const MICRO_QUALITY = [
  "Plutôt serré, lourd, chaud ou vide ?",
];
const MICRO_MOVEMENT = [
  "Stable ou ça bouge un peu ?",
];

/** Axes micro-exploration (ordre: localisation, qualité, mouvement). */
const MICRO_AXES = [MICRO_LOCALISATION, MICRO_QUALITY, MICRO_MOVEMENT];
const MICRO_QTYPES: QuestionType[] = [
  "SOMATIC_SHAPE",   // localisation → forme/place
  "SOMATIC_QUALITY",
  "SOMATIC_MOVEMENT",
];

/** Anciens axes (qualité, mouvement, forme, respiration) pour compat / fallback. */
const AXIS_A_QUALITY = [
  "Cette sensation est-elle plutôt serrée, lourde ou autre ?",
  "C'est plutôt tendu, brûlant ou engourdi ?",
  "Plutôt serré, lourd, chaud ou vide ?",
];
const AXIS_B_MOVEMENT = [
  "Est-ce que ça pulse, ça bouge ou c'est figé ?",
  "Stable ou ça bouge un peu ?",
  "Ça vibre, ça pulse ou c'est fixe ?",
];
const AXIS_C_SHAPE = [
  "C'est plutôt un point, une barre ou une zone plus large ?",
  "Plutôt centre ou bord ?",
  "Point précis, barre ou zone étendue ?",
];
const AXIS_D_BREATHING = [
  "Si vous expirez lentement, est-ce que ça change un tout petit peu ?",
  "En expirant doucement, l'intensité varie-t-elle un peu ?",
  "En soufflant lentement, est-ce que ça bouge d'un rien ?",
];

const AXES = [AXIS_A_QUALITY, AXIS_B_MOVEMENT, AXIS_C_SHAPE, AXIS_D_BREATHING];

const AXIS_QTYPES: QuestionType[] = [
  "SOMATIC_QUALITY",
  "SOMATIC_MOVEMENT",
  "SOMATIC_SHAPE",
  "SOMATIC_BREATH",
];

export type SomaticReplyResult = {
  reply: string;
  mode: "ASK";
  meta?: { qtype: QuestionType };
};

/**
 * Génère une réponse locale de micro-guidage : 1 phrase, 1 question max.
 * LOT 11 — Si avoid contient le qtype de l’axe choisi, cycle vers le prochain axe.
 */
export function makeSomaticReplyMicro(
  _zone: Zone,
  userText: string,
  avoid?: Set<QuestionType>
): SomaticReplyResult {
  const h = stableHash(userText.trim() || "micro");
  let axisIndex = h % MICRO_AXES.length;
  const tried = new Set<number>();
  while (tried.size < MICRO_AXES.length) {
    if (avoid?.has(MICRO_QTYPES[axisIndex])) {
      tried.add(axisIndex);
      axisIndex = (axisIndex + 1) % MICRO_AXES.length;
      continue;
    }
    break;
  }
  const templates = MICRO_AXES[axisIndex];
  const reply = templates[0];
  const qtype = MICRO_QTYPES[axisIndex];
  return { reply, mode: "ASK", meta: { qtype } };
}

export function makeSomaticReply(
  zone: Zone,
  userText: string,
  avoid?: Set<QuestionType>
): SomaticReplyResult {
  return makeSomaticReplyMicro(zone, userText, avoid);
}

/** LOT 7 — Map zone string du classifieur (ex: "gorge", "ventre") vers Zone. */
const CLASSIFIER_ZONE_MAP: Record<string, Zone> = {
  gorge: "GORGE",
  ventre: "VENTRE",
  estomac: "VENTRE",
  poitrine: "POITRINE",
  thorax: "POITRINE",
  nuque: "NUQUE_CERVICALES",
  cervicales: "NUQUE_CERVICALES",
  epaules: "EPAULES",
  machoire: "MACHOIRE",
  dos: "DOS",
  tete: "TETE",
  crane: "TETE",
  mains: "MAINS",
  jambes: "JAMBES",
};

export function mapClassifierZoneToZone(zoneString: string | null): Zone | null {
  if (!zoneString || typeof zoneString !== "string") return null;
  const key = zoneString.trim().toLowerCase();
  return CLASSIFIER_ZONE_MAP[key] ?? null;
}
