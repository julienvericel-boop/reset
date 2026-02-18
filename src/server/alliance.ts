/**
 * LOT 3 — Réparation d'alliance (réponse locale, pas d'OpenAI).
 * Quand l'utilisateur attaque ou se sent pas écouté : phrase relationnelle + choix simple.
 */

export type AllianceResult = { reply: string; mode: "REPAIR" };

/** Hash déterministe pour varier le template sans randomness. */
function stableHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Templates : (1) négation moquerie / reconnaissance + (2) choix 2 options max.
 * Max 1 "?", < 300 car. Interdits : pourquoi, vous devriez, il faut, essayez de, je pense, il semble que.
 */
const REPAIR_TEMPLATES: string[] = [
  "Je ne me moque pas de vous. Dites juste en 3 mots ce qui est le plus dur là.",
  "Je vous lis. On reste sur ce que vous ressentez, ou on cherche une zone du corps 1% plus neutre ?",
  "J'entends que ça ne passe pas. Vous préférez que je sois plus direct (très court) ou plus guidant (1 question) ?",
  "Je ne me moque pas de vous. On reste sur ce que vous ressentez, ou on cherche une zone du corps 1% plus neutre ?",
  "Je vous lis. Dites juste en 3 mots ce qui est le plus dur là.",
  "J'entends que ça ne passe pas. Dites juste en 3 mots ce qui est le plus dur là.",
];

/**
 * Génère une réponse locale de réparation d'alliance : 1–2 phrases, < 300 car,
 * phrase relationnelle + proposition de choix (2 options max).
 */
export function makeAllianceReply(userText: string): AllianceResult {
  const h = stableHash((userText || "").trim() || "repair");
  const index = h % REPAIR_TEMPLATES.length;
  const reply = REPAIR_TEMPLATES[index];
  return { reply, mode: "REPAIR" };
}
