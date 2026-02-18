import { describe, it, expect } from "vitest";
import { detectModeFromReply } from "./mode";

describe("detectModeFromReply", () => {
  it("'Restez quelques instants avec cette sensation.' -> STABILIZE", () => {
    expect(
      detectModeFromReply("Restez quelques instants avec cette sensation.")
    ).toBe("STABILIZE");
  });

  it("'Décrivez en deux mots...' -> ASK", () => {
    expect(detectModeFromReply("Décrivez en deux mots la sensation.")).toBe(
      "ASK"
    );
  });

  it("'Je ne me moque pas de vous.' -> ASK (REPAIR vient du serveur, pas déduit)", () => {
    expect(detectModeFromReply("Je ne me moque pas de vous.")).toBe("ASK");
  });

  it("'Laissez cette zone être là.' -> STABILIZE", () => {
    expect(detectModeFromReply("Laissez cette zone être là.")).toBe("STABILIZE");
  });

  it("'Gardez l'attention sur cette zone pendant quelques secondes.' -> STABILIZE", () => {
    expect(
      detectModeFromReply("Gardez l'attention sur cette zone pendant quelques secondes.")
    ).toBe("STABILIZE");
  });

  it("reply vide ou absente -> ASK", () => {
    expect(detectModeFromReply("")).toBe("ASK");
    expect(detectModeFromReply("   ")).toBe("ASK");
  });

  it("LOT 8 — 'Ok. Juste 10 secondes : sentez l'air...' -> STABILIZE", () => {
    expect(
      detectModeFromReply("Ok. Juste 10 secondes : sentez l'air qui sort à l'expiration. Est-ce que ça baisse d'1 % ?")
    ).toBe("STABILIZE");
  });

  it("'Qu'est-ce qui vous pèse maintenant ?' -> ASK", () => {
    expect(detectModeFromReply("Qu'est-ce qui vous pèse maintenant ?")).toBe("ASK");
  });
});
