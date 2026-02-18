import { describe, it, expect } from "vitest";
import { truncateResponse, hasDrift, isForbiddenStyle } from "./guardrails";

describe("truncateResponse", () => {
  it("retourne tel quel si ≤ 300 car et ≤ 2 phrases", () => {
    const short = "Une phrase. Une autre.";
    expect(truncateResponse(short)).toBe(short);
  });

  it("tronque à 300 caractères sur une limite de phrase", () => {
    const long =
      "A".repeat(280) + ". " + "B".repeat(30);
    const out = truncateResponse(long);
    expect(out.length).toBeLessThanOrEqual(301);
    expect(out).toMatch(/\.\s*$/);
  });

  it("garde au plus 2 phrases", () => {
    const three =
      "Première phrase. Deuxième phrase. Troisième phrase.";
    expect(truncateResponse(three)).toBe(
      "Première phrase. Deuxième phrase."
    );
  });

  it("gère ? et ! comme fin de phrase", () => {
    const mixed = "Oui? Non! Peut-être.";
    expect(truncateResponse(mixed)).toBe("Oui? Non!");
  });

  it("retourne chaîne vide pour entrée vide", () => {
    expect(truncateResponse("")).toBe("");
    expect(truncateResponse("   ")).toBe("");
  });

  it("sans ponctuation : applique uniquement limite 300 car", () => {
    const noPunct = "a".repeat(350);
    const out = truncateResponse(noPunct);
    expect(out.length).toBeLessThanOrEqual(300);
  });

  it("ne coupe pas après abréviation type etc. ou M.", () => {
    const withAbbrev = "Voir la doc etc. C'est important.";
    const out = truncateResponse(withAbbrev);
    expect(out).toContain("etc.");
    expect(out.length).toBeLessThanOrEqual(300);
  });
});

describe("hasDrift", () => {
  it("détecte 'pourquoi'", () => {
    expect(hasDrift("Et pourquoi vous pensez ça?")).toBe(true);
  });

  it("détecte 'je pense'", () => {
    expect(hasDrift("Je pense que vous devriez vous reposer.")).toBe(true);
  });

  it("détecte 'vous devriez'", () => {
    expect(hasDrift("Vous devriez respirer un coup.")).toBe(true);
  });

  it("détecte conseil explicite", () => {
    expect(hasDrift("Il faut que vous fassiez une pause.")).toBe(true);
  });

  it("pas de dérive pour réponse sobre", () => {
    expect(
      hasDrift(
        "Cette pensée revient en boucle. Remarquez où cela se sent dans votre corps."
      )
    ).toBe(false);
  });

  it("LOT 2.2 — flag 'il semble que' comme réponse vague (soft)", () => {
    expect(hasDrift("Il semble que ce soit difficile pour vous.")).toBe(true);
  });

  it("LOT 2.2 — flag 'préoccupation' comme réponse vague (soft)", () => {
    expect(hasDrift("Votre préoccupation est compréhensible.")).toBe(true);
  });
});

describe("isForbiddenStyle (LOT 8)", () => {
  it("'C'est normal de...' => true", () => {
    expect(isForbiddenStyle("C'est normal de ne pas savoir.")).toBe(true);
  });

  it("'C'est fréquent d'avoir...' => true", () => {
    expect(isForbiddenStyle("C'est fréquent d'avoir des doutes.")).toBe(true);
  });

  it("'Vous devriez...' => true", () => {
    expect(isForbiddenStyle("Vous devriez vous reposer.")).toBe(true);
  });

  it("phrase neutre courte => false", () => {
    expect(
      isForbiddenStyle("Remarquez où cela se sent dans votre corps.")
    ).toBe(false);
  });
});
