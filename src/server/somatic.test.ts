import { describe, it, expect } from "vitest";
import {
  detectSomaticZone,
  detectSomaticIntent,
  hasInternalCue,
  hasInternalCueFuzzy,
  shouldAskClassifierForSomatic,
  makeSomaticReply,
  type Zone,
} from "./somatic";

describe("detectSomaticZone", () => {
  it("'les cervicales' -> NUQUE_CERVICALES", () => {
    expect(detectSomaticZone("les cervicales")).toBe("NUQUE_CERVICALES");
  });

  it("'serré à la gorge' -> GORGE", () => {
    expect(detectSomaticZone("serré à la gorge")).toBe("GORGE");
  });

  it("'tension dans les épaules' -> EPAULES", () => {
    expect(detectSomaticZone("tension dans les épaules")).toBe("EPAULES");
  });

  it("'dans le ventre' -> VENTRE", () => {
    expect(detectSomaticZone("dans le ventre")).toBe("VENTRE");
  });

  it("'estomac' -> VENTRE", () => {
    expect(detectSomaticZone("ça serre à l'estomac")).toBe("VENTRE");
  });
});

describe("makeSomaticReply", () => {
  const zones: Zone[] = [
    "NUQUE_CERVICALES",
    "GORGE",
    "EPAULES",
    "VENTRE",
  ];

  it("reply contient exactement 1 '?' pour chaque zone testée", () => {
    for (const zone of zones) {
      const { reply } = makeSomaticReply(zone, "tension ici");
      const count = (reply.match(/\?/g) || []).length;
      expect(count).toBe(1);
    }
  });

  it("reply length < 300", () => {
    for (const zone of zones) {
      const { reply } = makeSomaticReply(zone, "texte user");
      expect(reply.length).toBeLessThan(300);
    }
  });

  it("pas de 'pourquoi', 'vous devriez', 'il faut'", () => {
    const forbidden = ["pourquoi", "vous devriez", "il faut"];
    for (const zone of zones) {
      const { reply } = makeSomaticReply(zone, "tension");
      const lower = reply.toLowerCase();
      for (const word of forbidden) {
        expect(lower).not.toContain(word);
      }
    }
  });

  it("retourne mode 'ASK'", () => {
    const out = makeSomaticReply("POITRINE", "serré");
    expect(out.mode).toBe("ASK");
  });
});

describe("detectSomaticZone + makeSomaticReply (intégration)", () => {
  it("'les cervicales' -> zone NUQUE_CERVICALES, reply avec 1 '?'", () => {
    const zone = detectSomaticZone("les cervicales");
    expect(zone).toBe("NUQUE_CERVICALES");
    const { reply } = makeSomaticReply(zone!, "les cervicales");
    expect((reply.match(/\?/g) || []).length).toBe(1);
  });

  it("'serré à la gorge' -> GORGE, 1 question", () => {
    const zone = detectSomaticZone("serré à la gorge");
    expect(zone).toBe("GORGE");
    const { reply } = makeSomaticReply(zone!, "serré à la gorge");
    expect((reply.match(/\?/g) || []).length).toBe(1);
  });
});

describe("LOT 2B — hasInternalCue / detectSomaticIntent", () => {
  it("'j'ai mal au dos depuis 3 jours' -> zone DOS, hasCue=false, ok=false", () => {
    const intent = detectSomaticIntent("j'ai mal au dos depuis 3 jours");
    expect(intent.zone).toBe("DOS");
    expect(intent.hasCue).toBe(false);
    expect(intent.ok).toBe(false);
  });

  it("'dans le dos' -> zone DOS, pas de cue -> ok=false", () => {
    const intent = detectSomaticIntent("dans le dos");
    expect(intent.zone).toBe("DOS");
    expect(intent.hasCue).toBe(false);
    expect(intent.ok).toBe(false);
  });

  it("'tension dans le dos' -> ok=true", () => {
    const intent = detectSomaticIntent("tension dans le dos");
    expect(intent.zone).toBe("DOS");
    expect(intent.hasCue).toBe(true);
    expect(intent.ok).toBe(true);
  });

  it("'serré à la gorge' -> ok=true", () => {
    const intent = detectSomaticIntent("serré à la gorge");
    expect(intent.zone).toBe("GORGE");
    expect(intent.hasCue).toBe(true);
    expect(intent.ok).toBe(true);
  });

  it("'pression dans la poitrine' -> ok=true", () => {
    const intent = detectSomaticIntent("pression dans la poitrine");
    expect(intent.zone).toBe("POITRINE");
    expect(intent.hasCue).toBe(true);
    expect(intent.ok).toBe(true);
  });
});

describe("hasInternalCue (régression: 'mal' n'est pas un cue)", () => {
  it("'j'ai mal au dos' -> false", () => {
    expect(hasInternalCue("j'ai mal au dos")).toBe(false);
  });

  it("'tension' seul -> true", () => {
    expect(hasInternalCue("tension")).toBe(true);
  });
});

describe("LOT 6 — robustesse (normalisation: nœud, ds, accents)", () => {
  it("'J'ai un nœud au ventre.' -> intent.ok === true", () => {
    const intent = detectSomaticIntent("J'ai un nœud au ventre.");
    expect(intent.zone).toBe("VENTRE");
    expect(intent.hasCue).toBe(true);
    expect(intent.ok).toBe(true);
  });

  it("'Ça appuie dans le thorax.' -> intent.ok === true", () => {
    const intent = detectSomaticIntent("Ça appuie dans le thorax.");
    expect(intent.zone).toBe("POITRINE");
    expect(intent.hasCue).toBe(true);
    expect(intent.ok).toBe(true);
  });

  it("'tension ds les cervicales' -> intent.ok === true", () => {
    const intent = detectSomaticIntent("tension ds les cervicales");
    expect(intent.zone).toBe("NUQUE_CERVICALES");
    expect(intent.hasCue).toBe(true);
    expect(intent.ok).toBe(true);
  });

  it("'nuque raide et tendue' -> intent.ok === true", () => {
    const intent = detectSomaticIntent("nuque raide et tendue");
    expect(intent.zone).toBe("NUQUE_CERVICALES");
    expect(intent.hasCue).toBe(true);
    expect(intent.ok).toBe(true);
  });
});

describe("LOT 11 — hasInternalCueFuzzy et shouldAskClassifierForSomatic", () => {
  it("'tenson ds cervicle' (typo cue) -> shouldAskClassifierForSomatic true via fuzzy", () => {
    const norm = "tenson dans les cervicle";
    expect(hasInternalCue(norm)).toBe(false);
    expect(hasInternalCueFuzzy(norm)).toBe(true);
    expect(shouldAskClassifierForSomatic(norm, false)).toBe(true);
  });

  it("hasInternalCueFuzzy: 'tenson' proche de 'tension' (lev 1)", () => {
    expect(hasInternalCueFuzzy("tenson")).toBe(true);
  });
});

describe("LOT 11 — makeSomaticReply anti-repeat (avoid qtype)", () => {
  it("même input avec avoid SOMATIC_SHAPE => qtype différent de SOMATIC_SHAPE", () => {
    const zone = "NUQUE_CERVICALES" as Zone;
    const userText = "tension ici";
    const outNoAvoid = makeSomaticReply(zone, userText);
    const outAvoidShape = makeSomaticReply(
      zone,
      userText,
      new Set(["SOMATIC_SHAPE"])
    );
    expect(outNoAvoid.meta?.qtype).toBeDefined();
    expect(outAvoidShape.meta?.qtype).toBeDefined();
    if (outNoAvoid.meta?.qtype === "SOMATIC_SHAPE") {
      expect(outAvoidShape.meta?.qtype).not.toBe("SOMATIC_SHAPE");
    }
  });
});
