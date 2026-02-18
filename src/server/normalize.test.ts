import { describe, it, expect } from "vitest";
import { normalizeText } from "./normalize";

describe("normalizeText", () => {
  it("lowercase", () => {
    expect(normalizeText("TU M'ÉCOUTES")).toBe("tu m'ecoutes");
  });

  it("apostrophe typographique → '", () => {
    expect(normalizeText("t'écoutes")).toBe("t'ecoutes");
    expect(normalizeText("m\u2019écoutes")).toBe("m'ecoutes");
  });

  it("œ → oe", () => {
    expect(normalizeText("nœud")).toBe("noeud");
  });

  it("diacritiques supprimés (NFD + strip)", () => {
    expect(normalizeText("écoute")).toBe("ecoute");
    expect(normalizeText("cervicales")).toBe("cervicales");
    expect(normalizeText("serré")).toBe("serre");
  });

  it("ds → dans", () => {
    expect(normalizeText("tension ds les cervicales")).toBe(
      "tension dans les cervicales"
    );
  });

  it("espaces compactés", () => {
    expect(normalizeText("a   b   c")).toBe("a b c");
  });
});
