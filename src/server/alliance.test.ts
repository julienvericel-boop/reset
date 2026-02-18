import { describe, it, expect } from "vitest";
import { makeAllianceReply } from "./alliance";

const FORBIDDEN = [
  "pourquoi",
  "vous devriez",
  "il faut",
  "essayez de",
  "je pense",
  "il semble",
];

function hasRecognitionOrNegation(reply: string): boolean {
  const lower = reply.toLowerCase();
  return (
    lower.includes("je ne me moque pas") ||
    lower.includes("je vous lis") ||
    lower.includes("j'entends que")
  );
}

describe("makeAllianceReply", () => {
  it("reply non vide", () => {
    const { reply } = makeAllianceReply("tu m'écoutes pas");
    expect(reply).toBeTruthy();
    expect(reply.trim().length).toBeGreaterThan(0);
  });

  it("length < 300", () => {
    const inputs = ["tu m'écoutes pas ?", "oui et??", "tu comprends rien", "x", ""];
    for (const input of inputs) {
      const { reply } = makeAllianceReply(input);
      expect(reply.length).toBeLessThan(300);
    }
  });

  it("pas de mots interdits", () => {
    for (const word of FORBIDDEN) {
      const { reply } = makeAllianceReply("tu m'écoutes pas " + word);
      expect(reply.toLowerCase()).not.toContain(word);
    }
    const { reply } = makeAllianceReply("oui et??");
    for (const word of FORBIDDEN) {
      expect(reply.toLowerCase()).not.toContain(word);
    }
  });

  it("mode === 'REPAIR'", () => {
    expect(makeAllianceReply("tu m'écoutes pas").mode).toBe("REPAIR");
  });

  it("max 1 '?'", () => {
    const inputs = ["tu m'écoutes pas ?", "oui et??", "tu comprends rien"];
    for (const input of inputs) {
      const { reply } = makeAllianceReply(input);
      const count = (reply.match(/\?/g) || []).length;
      expect(count).toBeLessThanOrEqual(1);
    }
  });

  it("'tu m'écoutes pas ?' -> reply contient négation moquerie ou reconnaissance", () => {
    const { reply } = makeAllianceReply("tu m'écoutes pas ?");
    expect(hasRecognitionOrNegation(reply)).toBe(true);
  });

  it("'oui et??' -> reply contient négation moquerie ou reconnaissance", () => {
    const { reply } = makeAllianceReply("oui et??");
    expect(hasRecognitionOrNegation(reply)).toBe(true);
  });

  it("'tu comprends rien' -> reply contient négation moquerie ou reconnaissance", () => {
    const { reply } = makeAllianceReply("tu comprends rien");
    expect(hasRecognitionOrNegation(reply)).toBe(true);
  });
});
