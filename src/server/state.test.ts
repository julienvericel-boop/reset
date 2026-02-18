import { describe, it, expect } from "vitest";
import { detectState, isRuminationMarker, type ChatMessage } from "./state";

function msg(role: "user" | "assistant", content: string): ChatMessage {
  return { role, content };
}

describe("detectState", () => {
  it("retourne DEFAULT pour messages vides", () => {
    expect(detectState([])).toBe("DEFAULT");
  });

  it("retourne ALLIANCE_REPAIR si user dit qu'on ne l'écoute pas", () => {
    expect(
      detectState([msg("user", "Tu m'écoutes pas là.")])
    ).toBe("ALLIANCE_REPAIR");
    expect(
      detectState([msg("user", "t'écoutes pas ce que je dis")])
    ).toBe("ALLIANCE_REPAIR");
  });

  it("retourne ALLIANCE_REPAIR pour 'oui et?' / 'oui et??'", () => {
    expect(detectState([msg("user", "oui et?")])).toBe("ALLIANCE_REPAIR");
    expect(detectState([msg("user", "oui et??")])).toBe("ALLIANCE_REPAIR");
  });

  it("retourne ALLIANCE_REPAIR pour agressivité / incompris", () => {
    expect(
      detectState([msg("user", "Tu comprends rien.")])
    ).toBe("ALLIANCE_REPAIR");
    expect(
      detectState([msg("user", "écoute-moi un peu")])
    ).toBe("ALLIANCE_REPAIR");
  });

  it("retourne SOMATIC_ACTIVE si user nomme une zone (poitrine, ventre)", () => {
    expect(
      detectState([msg("user", "Ça se sent dans la poitrine.")])
    ).toBe("SOMATIC_ACTIVE");
    expect(
      detectState([msg("user", "Un peu dans le ventre.")])
    ).toBe("SOMATIC_ACTIVE");
  });

  it("retourne SOMATIC_ACTIVE pour tension / zone précise", () => {
    expect(
      detectState([msg("user", "Tension dans les épaules.")])
    ).toBe("SOMATIC_ACTIVE");
    expect(
      detectState([msg("user", "Serré à la gorge.")])
    ).toBe("SOMATIC_ACTIVE");
  });

  it("retourne STAGNATION pour 'ça sert à rien'", () => {
    expect(
      detectState([msg("user", "Ça sert à rien.")])
    ).toBe("STAGNATION");
    expect(
      detectState([msg("user", "ça sert a rien")])
    ).toBe("STAGNATION");
  });

  it("retourne STAGNATION pour 'et alors' / 'aucun changement'", () => {
    expect(detectState([msg("user", "et alors")])).toBe("STAGNATION");
    expect(
      detectState([msg("user", "Aucun changement.")])
    ).toBe("STAGNATION");
  });

  it("retourne STAGNATION pour 'ça change rien' / 'toujours pareil'", () => {
    expect(
      detectState([msg("user", "Ça change rien.")])
    ).toBe("STAGNATION");
    expect(
      detectState([msg("user", "Toujours pareil.")])
    ).toBe("STAGNATION");
  });

  it("retourne DEFAULT pour message neutre (pas d'état spécial)", () => {
    expect(
      detectState([msg("user", "J'ai peur de rater mon entretien.")])
    ).toBe("DEFAULT");
    expect(
      detectState([
        msg("assistant", "Remarquez où cela se sent dans votre corps."),
        msg("user", "Je sais pas trop."),
      ])
    ).toBe("DEFAULT");
  });

  it("LOT 11 — rumination 'Je pense sans arrêt...' / 'ça tourne' ne déclenche pas STAGNATION", () => {
    expect(
      detectState([
        msg(
          "user",
          "Je pense sans arrêt à cette erreur et ça ne change rien."
        ),
      ])
    ).toBe("DEFAULT");
    expect(
      detectState([msg("user", "ça tourne en boucle, toujours pareil")])
    ).toBe("DEFAULT");
  });

  it("s'appuie sur le dernier message user (priorité alliance > stagnation > somatic)", () => {
    const withHistory: ChatMessage[] = [
      msg("assistant", "Remarquez où cela se sent."),
      msg("user", "Dans la poitrine."),
      msg("assistant", "Restez quelques instants avec cette sensation."),
      msg("user", "Tu m'écoutes pas."),
    ];
    expect(detectState(withHistory)).toBe("ALLIANCE_REPAIR");
  });

  describe("LOT 6 — robustesse (apostrophe typo, accents)", () => {
    it("'Tu m'écoutes pas ?' (apostrophe typographique U+2019) -> ALLIANCE_REPAIR", () => {
      expect(
        detectState([msg("user", "Tu m\u2019écoutes pas ?")])
      ).toBe("ALLIANCE_REPAIR");
    });

    it("'T'es nul.' (apostrophe typographique) -> ALLIANCE_REPAIR", () => {
      expect(detectState([msg("user", "T\u2019es nul.")])).toBe("ALLIANCE_REPAIR");
    });

    it("'Oui et ??' -> ALLIANCE_REPAIR", () => {
      expect(detectState([msg("user", "Oui et ??")])).toBe("ALLIANCE_REPAIR");
    });

    it("'Écoute-moi' (accent) -> ALLIANCE_REPAIR", () => {
      expect(detectState([msg("user", "Écoute-moi")])).toBe("ALLIANCE_REPAIR");
    });
  });

  describe("LOT 11 — isRuminationMarker", () => {
    it("détecte 'je pense', 'ça tourne', 'tourne en boucle'", () => {
      expect(isRuminationMarker("je pense sans arret")).toBe(true);
      expect(isRuminationMarker("ca tourne")).toBe(true);
      expect(isRuminationMarker("tourne en boucle")).toBe(true);
    });
    it("'ça sert à rien' sans rumination -> false", () => {
      expect(isRuminationMarker("ca sert a rien")).toBe(false);
    });
  });
});
