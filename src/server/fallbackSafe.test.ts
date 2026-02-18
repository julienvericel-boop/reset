import { describe, it, expect } from "vitest";
import { makeSafeAskReply } from "./fallbackSafe";

describe("makeSafeAskReply", () => {
  it("retourne mode ASK", () => {
    expect(makeSafeAskReply().mode).toBe("ASK");
  });

  it("reply non vide, < 300 car, 1 question max", () => {
    const { reply } = makeSafeAskReply();
    expect(reply.length).toBeGreaterThan(0);
    expect(reply.length).toBeLessThan(300);
    expect((reply.match(/\?/g) || []).length).toBeLessThanOrEqual(1);
  });

  it("ne contient pas de mots interdits style", () => {
    const { reply } = makeSafeAskReply();
    const lower = reply.toLowerCase();
    expect(lower).not.toMatch(/c'?est\s+normal/);
    expect(lower).not.toMatch(/vous devriez|il faut|essayez de|je pense|il semble/);
  });
});
