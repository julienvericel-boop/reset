import { describe, it, expect } from "vitest";
import { makeStagnationReply } from "./stagnation";

const FORBIDDEN = [
  "pourquoi",
  "vous devriez",
  "il faut",
  "essayez de",
  "je pense",
  "il semble",
  "c'est normal",
  "c'est bien",
];

function hasRecognition(reply: string): boolean {
  const lower = reply.toLowerCase();
  return (
    lower.includes("ça ne bouge pas") ||
    lower.includes("ça ne change pas") ||
    lower.includes("impasse")
  );
}

describe("makeStagnationReply", () => {
  it("reply non vide", () => {
    const { reply } = makeStagnationReply("ça sert à rien");
    expect(reply).toBeTruthy();
    expect(reply.trim().length).toBeGreaterThan(0);
  });

  it("length < 300", () => {
    const inputs = ["ça sert à rien", "et alors", "rien ne change", "x", ""];
    for (const input of inputs) {
      const { reply } = makeStagnationReply(input);
      expect(reply.length).toBeLessThan(300);
    }
  });

  it("mode === 'ASK'", () => {
    expect(makeStagnationReply("ça sert à rien").mode).toBe("ASK");
  });

  it("max 1 '?'", () => {
    const inputs = ["ça sert à rien", "et alors", "rien ne change"];
    for (const input of inputs) {
      const { reply } = makeStagnationReply(input);
      const count = (reply.match(/\?/g) || []).length;
      expect(count).toBeLessThanOrEqual(1);
    }
  });

  it("pas de mots interdits", () => {
    for (const word of FORBIDDEN) {
      const { reply } = makeStagnationReply("ça sert à rien " + word);
      expect(reply.toLowerCase()).not.toContain(word);
    }
    const { reply } = makeStagnationReply("et alors");
    for (const word of FORBIDDEN) {
      expect(reply.toLowerCase()).not.toContain(word);
    }
  });

  it("'ça sert à rien' -> reply contient reconnaissance impasse", () => {
    const { reply } = makeStagnationReply("ça sert à rien");
    expect(hasRecognition(reply)).toBe(true);
  });

  it("'et alors' -> reply contient reconnaissance impasse", () => {
    const { reply } = makeStagnationReply("et alors");
    expect(hasRecognition(reply)).toBe(true);
  });

  it("'rien ne change' -> reply contient reconnaissance impasse", () => {
    const { reply } = makeStagnationReply("rien ne change");
    expect(hasRecognition(reply)).toBe(true);
  });

  it("LOT 11 — 'ça sert à rien' avec avoid STAG_TWO_WORDS => reply a un autre qtype", () => {
    const outAvoid = makeStagnationReply(
      "ça sert à rien",
      new Set(["STAG_TWO_WORDS"])
    );
    expect(outAvoid.meta?.qtype).toBeDefined();
    expect(outAvoid.meta?.qtype).not.toBe("STAG_TWO_WORDS");
  });
});
