/**
 * LOT 4 — Stagnation (réponse locale, pas d'OpenAI).
 * LOT 11 — anti-répétition (avoid qtype), meta.qtype.
 */

import type { QuestionType } from "./qtype";

export type StagnationResult = {
  reply: string;
  mode: "ASK" | "END_CHOICE";
  meta?: { qtype?: QuestionType };
};

/** Hash déterministe pour varier le template sans randomness. */
function stableHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Templates : (1) reconnaissance impasse + (2) choix A ou B (2 options max).
 * Max 2 phrases, max 1 "?". Interdits : pourquoi, vous devriez, il faut, essayez de, je pense, il semble que, c'est normal, c'est bien.
 */
const STAGNATION_TEMPLATES: string[] = [
  "Ok, pour l'instant ça ne bouge pas. Décrivez la sensation en 2 mots (ex: serré, lourd, chaud) ?",
  "D'accord, ça ne change pas. Cherchez ailleurs une zone 1% plus neutre et dites laquelle ?",
  "Ok, pour l'instant ça ne bouge pas. Cherchez ailleurs une zone 1% plus neutre et dites laquelle ?",
  "D'accord, ça ne change pas. Décrivez la sensation en 2 mots (ex: serré, lourd, chaud) ?",
  "D'accord, impasse pour l'instant. Décrivez la sensation en 2 mots (ex: serré, lourd) ?",
  "Ok, ça ne bouge pas là. Vous préférez décrire en 2 mots ou chercher une zone un peu plus neutre ?",
];

const STAGNATION_QTYPES: QuestionType[] = [
  "STAG_TWO_WORDS",
  "STAG_NEUTRAL_ZONE",
  "STAG_NEUTRAL_ZONE",
  "STAG_TWO_WORDS",
  "STAG_TWO_WORDS",
  "STAG_CHOICE",
];

/** Réponse impasse : proposer arrêter (END_CHOICE), pas "3 mots" ni relance. */
export const STAGNATION_IMPASSE_REPLY =
  "D'accord, on peut arrêter ici pour le moment.";

/**
 * Impasse (lastPromptType identique 2 fois d'affilée) → END_CHOICE.
 */
export function makeStagnationImpasseReply(): StagnationResult {
  return {
    reply: STAGNATION_IMPASSE_REPLY,
    mode: "END_CHOICE",
  };
}

/**
 * Génère une réponse locale pour stagnation : reconnaissance impasse + choix simple (2 options max).
 * Si allowNeutralZone false, n'inclut pas les templates "zone 1% neutre" (jamais 2x de suite).
 */
export function makeStagnationReply(
  userText: string,
  avoid?: Set<QuestionType>,
  options?: { allowNeutralZone?: boolean }
): StagnationResult {
  const allowNeutralZone = options?.allowNeutralZone !== false;
  const indices = STAGNATION_TEMPLATES.map((_, i) => i).filter((i) => {
    if (!allowNeutralZone && STAGNATION_QTYPES[i] === "STAG_NEUTRAL_ZONE")
      return false;
    return true;
  });
  if (indices.length === 0) {
    return makeStagnationImpasseReply();
  }
  const h = stableHash((userText || "").trim() || "stagnation");
  let idx = h % indices.length;
  const tried = new Set<number>();
  const pool = indices.map((i) => ({ i, qtype: STAGNATION_QTYPES[i] }));
  while (tried.size < pool.length) {
    const { i, qtype } = pool[idx];
    if (avoid?.has(qtype)) {
      tried.add(idx);
      idx = (idx + 1) % pool.length;
      continue;
    }
    const reply = STAGNATION_TEMPLATES[i];
    return { reply, mode: "ASK", meta: { qtype } };
  }
  return makeStagnationImpasseReply();
}
