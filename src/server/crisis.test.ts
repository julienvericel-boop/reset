import { describe, it, expect } from "vitest";
import {
  detectSelfHarm,
  makeCrisisReply,
  detectPanic,
  hasPanicMarker,
  allowClassifierPanic,
  allowClassifierSelfHarm,
} from "./crisis";
import { makePanicReply } from "./panic";

describe("detectSelfHarm", () => {
  it("détecte 'envie de me faire du mal'", () => {
    expect(detectSelfHarm("j'ai envie de me faire du mal")).toBe(true);
  });

  it("détecte 'je veux mourir'", () => {
    expect(detectSelfHarm("je veux mourir")).toBe(true);
  });

  it("détecte 'je vais me suicider'", () => {
    expect(detectSelfHarm("Je vais me suicider")).toBe(true);
  });

  it("détecte 'suicide'", () => {
    expect(detectSelfHarm("je pense au suicide")).toBe(true);
  });

  it("détecte 'me tuer'", () => {
    expect(detectSelfHarm("envie de me tuer")).toBe(true);
  });

  it("'Je suis en panique' ne déclenche pas self-harm", () => {
    expect(detectSelfHarm("Je suis en panique")).toBe(false);
  });
});

describe("makeCrisisReply", () => {
  it("contient 112 et 3114", () => {
    const { reply } = makeCrisisReply();
    expect(reply).toContain("112");
    expect(reply).toContain("3114");
  });

  it("contient proche", () => {
    expect(makeCrisisReply().reply.toLowerCase()).toMatch(/proche/);
  });

  it("mode STABILIZE", () => {
    expect(makeCrisisReply().mode).toBe("STABILIZE");
  });
});

describe("detectPanic", () => {
  it("détecte 'Je suis en panique'", () => {
    expect(detectPanic("Je suis en panique")).toBe(true);
  });

  it("détecte 'en panique'", () => {
    expect(detectPanic("je suis en panique là")).toBe(true);
  });

  it("'je veux mourir' ne déclenche pas panic (c'est crise)", () => {
    expect(detectPanic("je veux mourir")).toBe(false);
  });
});

describe("makePanicReply", () => {
  it("ne contient pas 112", () => {
    expect(makePanicReply().reply).not.toContain("112");
  });

  it("mode STABILIZE", () => {
    expect(makePanicReply().mode).toBe("STABILIZE");
  });
});

describe("LOT 10 — hasPanicMarker, allowClassifierPanic, allowClassifierSelfHarm", () => {
  it("hasPanicMarker: panique, angoisse, anxieux", () => {
    expect(hasPanicMarker("je suis en panique")).toBe(true);
    expect(hasPanicMarker("angoisse")).toBe(true);
    expect(hasPanicMarker("je suis anxieux")).toBe(true);
    expect(hasPanicMarker("crise d'angoisse")).toBe(true);
  });

  it("hasPanicMarker: rumination sans marqueur → false", () => {
    expect(hasPanicMarker("je pense sans arret a cette erreur")).toBe(false);
  });

  it("allowClassifierPanic: PANIC + marqueur → true", () => {
    expect(allowClassifierPanic("je suis angoisse", "PANIC")).toBe(true);
  });

  it("allowClassifierPanic: PANIC sans marqueur → false", () => {
    expect(allowClassifierPanic("je pense sans arret", "PANIC")).toBe(false);
  });

  it("allowClassifierSelfHarm: toujours false (local only)", () => {
    expect(allowClassifierSelfHarm("texte", "SELF_HARM")).toBe(false);
  });
});
