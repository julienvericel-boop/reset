import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCreate = vi.fn();
const mockClassifyLastUser = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

vi.mock("@/server/classifier", () => ({
  classifyLastUser: (...args: unknown[]) => mockClassifyLastUser(...args),
}));

async function postChat(body: { messages?: { role: string; content: string }[]; message?: string }) {
  const { POST } = await import("./route");
  const req = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as import("next/server").NextRequest);
}

describe("POST /api/chat — LOT 2", () => {
  const env = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "sk-test";
    mockClassifyLastUser.mockResolvedValue({
      state: "DEFAULT",
      confidence: 0,
      zone: null,
      cue: null,
    });
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = env;
  });

  it("Test 1: input long (pavé narratif) → 1 phrase reformulation + pivot corps", async () => {
    const longInput =
      "Je n'arrête pas de repenser à ce que j'ai dit hier à mon collègue, j'aurais dû me taire, et maintenant tout le monde doit me détester et je ne sais pas comment rattraper ça et ça tourne dans ma tête sans arrêt depuis ce matin.";
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              "Cette situation revient en boucle et prend beaucoup de place. Remarquez où cela se sent dans votre corps.",
          },
        },
      ],
    });

    const res = await postChat({
      messages: [{ role: "user", content: longInput }],
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toBeDefined();
    expect(data.reply.length).toBeLessThanOrEqual(300);
    const sentences = data.reply.split(/[.!?]+/).filter(Boolean);
    expect(sentences.length).toBeLessThanOrEqual(2);
    expect(data.reply.toLowerCase()).toMatch(/corps|sensation|remarquez|où/);
    expect(data.reply.toLowerCase()).not.toMatch(/\bpourquoi\b/);
  });

  it("Test 2: 'Je ne sens rien' → normalisation + zone concrète", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              "Regardez simplement : mâchoire, épaules, poitrine ou ventre.",
          },
        },
      ],
    });

    const res = await postChat({
      messages: [{ role: "user", content: "Je ne sens rien." }],
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toBeDefined();
    expect(data.reply.length).toBeLessThanOrEqual(300);
    expect(
      /mâchoire|épaules|poitrine|ventre|zone/i.test(data.reply)
    ).toBe(true);
  });

  it("Test 3: colère forte → pas de conseil, pas d'analyse", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              "Cette colère occupe tout l'espace. Remarquez où elle se situe dans votre corps.",
          },
        },
      ],
    });

    const res = await postChat({
      messages: [
        {
          role: "user",
          content: "J'en ai marre, tout me saoule, c'est n'importe quoi.",
        },
      ],
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toBeDefined();
    expect(data.reply.length).toBeLessThanOrEqual(300);
    expect(data.reply.toLowerCase()).not.toMatch(/\bvous devriez\b|\bil faut\b|conseil|essayez\s+de/);
  });

  it("tronque si la réponse IA dépasse 300 car ou 2 phrases", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              "Cette pensée revient en boucle et prend beaucoup de place. Remarquez où cela se sent dans votre corps. Et n'oubliez pas de bien respirer et de vous détendre un peu car c'est important pour votre bien-être mental et physique sur le long terme.",
          },
        },
      ],
    });

    const res = await postChat({
      messages: [{ role: "user", content: "Je rumine." }],
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply.length).toBeLessThanOrEqual(300);
    const phrases = data.reply.split(/[.!?]+/).filter(Boolean);
    expect(phrases.length).toBeLessThanOrEqual(2);
  });

  it("retourne 400 si pas de message", async () => {
    const res = await postChat({});
    expect(res.status).toBe(400);
  });

  it("LOT 3 — 'tu m'écoutes pas' → mode REPAIR, pas d'appel OpenAI", async () => {
    const res = await postChat({
      messages: [{ role: "user", content: "tu m'écoutes pas" }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.reply).toBeDefined();
    expect(data.mode).toBe("REPAIR");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("LOT 4 — 'ça sert à rien' → mode ASK, pas d'appel OpenAI", async () => {
    const res = await postChat({
      messages: [{ role: "user", content: "ça sert à rien" }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.reply).toBeDefined();
    expect(data.mode).toBe("ASK");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("LOT 6 — 'Je vais me suicider' → réponse crise locale (112 + 3114), pas OpenAI, puis END", async () => {
    const res = await postChat({
      messages: [{ role: "user", content: "Je vais me suicider." }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.reply).toBeDefined();
    expect(data.reply).toContain("112");
    expect(data.reply).toContain("3114");
    expect(data.mode).toBe("ENDED");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("LOT 6 — 'Je suis en panique' → réponse panic locale (pas 112), pas OpenAI", async () => {
    const res = await postChat({
      messages: [{ role: "user", content: "Je suis en panique." }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.reply).toBeDefined();
    expect(data.reply).not.toContain("112");
    expect(data.mode).toBe("STABILIZE");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("MVP — 'termine' / intention de fin → ENDED, pas d'autre question", async () => {
    const res = await postChat({
      messages: [{ role: "user", content: "termine" }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.mode).toBe("ENDED");
    expect(data.reply).toBeDefined();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("MVP — 'Je ne sens rien' → réponse fixe (mâchoire/épaules/poitrine/ventre), pas cognitif", async () => {
    const res = await postChat({
      messages: [{ role: "user", content: "Je ne sens rien." }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.reply).toMatch(/mâchoire|épaules|poitrine|ventre|frequent/i);
    expect(data.reply).not.toMatch(/qu'est-ce qui pèse|pourquoi/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("MVP — 'arrête de te répéter' → END_CHOICE (Continuer/Terminer), pas '3 mots'", async () => {
    const res = await postChat({
      messages: [{ role: "user", content: "arrête de te répéter" }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.mode).toBe("END_CHOICE");
    expect(data.reply).toBeDefined();
    expect(data.reply).not.toMatch(/3 mots|trois mots/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("LOT 7 — quand heuristiques locales matchent, classifieur NOT called", async () => {
    await postChat({
      messages: [{ role: "user", content: "tu m'écoutes pas" }],
    });
    expect(mockClassifyLastUser).not.toHaveBeenCalled();
  });

  it("LOT 7 — classifieur renvoie ALLIANCE_REPAIR → réponse locale REPAIR", async () => {
    mockClassifyLastUser.mockResolvedValueOnce({
      state: "ALLIANCE_REPAIR",
      confidence: 0.9,
      zone: null,
      cue: null,
    });
    const res = await postChat({
      messages: [{ role: "user", content: "c'est n'importe quoi ce que tu racontes" }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.mode).toBe("REPAIR");
    expect(data.reply).toBeDefined();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("LOT 7 — classifieur renvoie PANIC + marqueur panic dans le texte → réponse locale STABILIZE (pas 112)", async () => {
    mockClassifyLastUser.mockResolvedValueOnce({
      state: "PANIC",
      confidence: 0.9,
      zone: null,
      cue: null,
    });
    const res = await postChat({
      messages: [{ role: "user", content: "je suis angoissé" }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.mode).toBe("STABILIZE");
    expect(data.reply).not.toContain("112");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("LOT 8 — OpenAI renvoie 'C'est normal...' -> fallbackSafe (mode ASK), pas de 2e appel", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "C'est normal de ne pas savoir. Remarquez où cela se sent.",
          },
        },
      ],
    });
    const res = await postChat({
      messages: [{ role: "user", content: "Je ne sens rien de particulier." }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.mode).toBe("ASK");
    expect(data.reply).not.toMatch(/c'?est\s+normal/i);
    expect(data.reply).toMatch(/corps|remarquez|où|mâchoire|épaules|poitrine|ventre/i);
  });

  it("LOT 8 — conversation corps (poitrine → détail) → 200, reply définie", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "Restez quelques instants avec cette sensation.",
          },
        },
      ],
    });
    const res = await postChat({
      messages: [
        { role: "user", content: "Dans la poitrine." },
        { role: "assistant", content: "Où exactement ?" },
        { role: "user", content: "Un peu à gauche." },
      ],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.reply).toBeDefined();
    expect(data.reply.length).toBeLessThanOrEqual(300);
    if (/restez\s+quelques\s+instants/i.test(data.reply)) {
      expect(data.mode).toBe("STABILIZE");
    }
  });

  it("LOT 8 — OpenAI renvoie question neutre -> mode ASK", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "Qu'est-ce qui vous pèse le plus en ce moment ?",
          },
        },
      ],
    });
    const res = await postChat({
      messages: [{ role: "user", content: "Je suis stressé." }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.mode).toBe("ASK");
  });

  it("LOT 10 — classifieur renvoie SELF_HARM sans marqueur local → ignoré, DEFAULT (pas 112)", async () => {
    mockClassifyLastUser.mockResolvedValueOnce({
      state: "SELF_HARM",
      confidence: 1,
      zone: null,
      cue: null,
    });
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "Qu'est-ce qui pèse le plus en ce moment ?",
          },
        },
      ],
    });
    const res = await postChat({
      messages: [{ role: "user", content: "j'ai des idées noires" }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.reply).not.toContain("112");
    expect(data.reply).not.toContain("3114");
    expect(mockCreate).toHaveBeenCalled();
  });

  it("LOT 5 — après échange corps (poitrine, détail) → 200, reply définie", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              "Restez quelques instants avec cette sensation.",
          },
        },
      ],
    });

    const res = await postChat({
      messages: [
        { role: "user", content: "Dans la poitrine." },
        { role: "assistant", content: "Où exactement ?" },
        { role: "user", content: "Un peu à gauche." },
      ],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.reply).toBeDefined();
  });

  it("LOT 2.2 — 'Peux-tu m'aider ?' → demande une phrase de contexte (pas de pivot corps direct)", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              "Qu'est-ce qui tourne le plus en tête là, en une phrase ?",
          },
        },
      ],
    });

    const res = await postChat({
      messages: [{ role: "user", content: "Peux-tu m'aider ?" }],
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toBeDefined();
    expect(data.reply.length).toBeLessThanOrEqual(300);
    expect(data.reply).toMatch(/phrase|contexte|tête|pèse|tourne|qu'est-ce/i);
  });

  it("LOT 2.2 — 'Je vais mal.' → reflète l'état + pivot corporel concret (poitrine/ventre/gorge) ou corps", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              "Vous ne vous sentez vraiment pas bien. Remarquez où cela se sent : poitrine, ventre ou gorge.",
          },
        },
      ],
    });

    const res = await postChat({
      messages: [{ role: "user", content: "Je vais mal." }],
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toBeDefined();
    expect(data.reply.length).toBeLessThanOrEqual(300);
    expect(
      /poitrine|ventre|gorge|corps|remarquez|sensation/.test(data.reply.toLowerCase())
    ).toBe(true);
  });

  it("input avec 'pourquoi' et conseil : pas de pourquoi, pas de conseil, ≤2 phrases, ≤300 car", async () => {
    const input =
      "Je pense sans arrêt à cette erreur et franchement je devrais faire mieux mais je ne sais pas pourquoi je suis comme ça.";
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              "Cette erreur revient en boucle et prend beaucoup de place. Remarquez où cela se sent dans votre corps.",
          },
        },
      ],
    });

    const res = await postChat({ messages: [{ role: "user", content: input }] });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toBeDefined();
    expect(data.reply.length).toBeLessThanOrEqual(300);
    expect(data.reply.toLowerCase()).not.toMatch(/\bpourquoi\b/);
    expect(data.reply.toLowerCase()).not.toMatch(/\bvous devriez\b|\bil faut\b|conseil|essayez\s+de/);
    const phrases = data.reply.split(/[.!?]+/).filter(Boolean);
    expect(phrases.length).toBeLessThanOrEqual(2);
  });

  describe("LOT 10 — Classifier gates et rattrapage somatic", () => {
    it("rumination 'Je pense sans arrêt...' + classifieur mocké PANIC → pas réponse panic, mode ASK (OpenAI)", async () => {
      mockClassifyLastUser.mockResolvedValueOnce({
        state: "PANIC",
        confidence: 0.9,
        zone: null,
        cue: null,
      });
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content:
                "Cette pensée revient en boucle. Où ça se sent dans le corps ?",
            },
          },
        ],
      });
      const res = await postChat({
        messages: [
          {
            role: "user",
            content:
              "Je pense sans arrêt à cette erreur et je n'arrive pas à lâcher.",
          },
        ],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.mode).toBe("ASK");
      expect(data.reply).not.toMatch(/10 secondes|expiration/);
      expect(mockCreate).toHaveBeenCalled();
    });

    it("'je suis en panique' → réponse panic locale (inchangé), pas OpenAI", async () => {
      const res = await postChat({
        messages: [{ role: "user", content: "je suis en panique" }],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.mode).toBe("STABILIZE");
      expect(data.reply).toMatch(/10 secondes|expiration/);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("'tension ds les cercales' (typo zone) + classifieur SOMATIC_ACTIVE cue zone nuque → somatic local, pas OpenAI", async () => {
      mockClassifyLastUser.mockResolvedValueOnce({
        state: "SOMATIC_ACTIVE",
        confidence: 0.9,
        zone: "nuque",
        cue: true,
      });
      const res = await postChat({
        messages: [
          { role: "user", content: "tension ds les cercales" },
        ],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.mode).toBe("ASK");
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("'tension ds les cercales' + classifieur DEFAULT → fallback OpenAI", async () => {
      mockClassifyLastUser.mockResolvedValueOnce({
        state: "DEFAULT",
        confidence: 0.3,
        zone: null,
        cue: null,
      });
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Remarquez où ça se situe.",
            },
          },
        ],
      });
      const res = await postChat({
        messages: [
          { role: "user", content: "tension ds les cercales" },
        ],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.reply).toBeDefined();
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe("LOT 11 — Anti-répétition somatic, gate stagnation rumination", () => {
    it("3x 'tension ds les cervicales' avec meta.qtype du tour précédent => qtype alterne", async () => {
      const input = "tension ds les cervicales";
      const messages: { role: string; content: string; meta?: { qtype: string } }[] = [
        { role: "user", content: input },
      ];
      const qtypes: string[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await postChat({ messages });
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.meta?.qtype).toBeDefined();
        qtypes.push(data.meta.qtype);
        messages.push({
          role: "assistant",
          content: data.reply,
          meta: { qtype: data.meta.qtype },
        });
        messages.push({ role: "user", content: input });
      }
      expect(qtypes[0]).not.toBe(qtypes[1]);
      expect(qtypes[1]).not.toBe(qtypes[2]);
    });

    it("'Je pense sans arrêt...' ne déclenche pas STAGNATION (state DEFAULT)", async () => {
      mockClassifyLastUser.mockResolvedValueOnce({
        state: "DEFAULT",
        confidence: 0.3,
        zone: null,
        cue: null,
      });
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content:
                "Cette pensée revient en boucle. Où ça se sent dans le corps ?",
            },
          },
        ],
      });
      const res = await postChat({
        messages: [
          {
            role: "user",
            content:
              "Je pense sans arrêt à cette erreur et ça ne change rien.",
          },
        ],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.reply).not.toMatch(/Décrivez la sensation en 2 mots|zone 1% plus neutre/);
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe("LOT 9bis — DefaultQuick et anti-répétition", () => {
    it("'ok' → DefaultQuick local, pas d'appel OpenAI, pas d'appel classifieur, meta.qtype présent", async () => {
      const res = await postChat({
        messages: [{ role: "user", content: "ok" }],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.reply).toBeDefined();
      expect(data.mode).toBe("ASK");
      expect(data.meta?.qtype).toBeDefined();
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockClassifyLastUser).not.toHaveBeenCalled();
    });

    it("dernier assistant meta.qtype DQ_INTENSITY, user 'ok' → reply différente de DQ_INTENSITY (anti-répétition)", async () => {
      const res = await postChat({
        messages: [
          { role: "user", content: "stress" },
          {
            role: "assistant",
            content: "Ok. Intensité là, de 1 à 5 ?",
            meta: { qtype: "DQ_INTENSITY" },
          },
          { role: "user", content: "ok" },
        ],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.reply).not.toBe("Ok. Intensité là, de 1 à 5 ?");
      expect(data.meta?.qtype).not.toBe("DQ_INTENSITY");
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("OpenAI reply inférée même qtype que last assistant → route renvoie DefaultQuick différent (pas OpenAI)", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Intensité de 1 à 5 ?",
            },
          },
        ],
      });
      const res = await postChat({
        messages: [
          { role: "user", content: "j'ai mal" },
          {
            role: "assistant",
            content: "Ok. Intensité là, de 1 à 5 ?",
            meta: { qtype: "DQ_INTENSITY" },
          },
          { role: "user", content: "ça va un peu" },
        ],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.reply).not.toBe("Intensité de 1 à 5 ?");
      expect(data.meta?.qtype).toBeDefined();
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe("LOT 12 — Gate classifieur, timeouts, drift fallbackSafe", () => {
    it("message non trivial sans match local → classifieur appelé une fois (case2)", async () => {
      mockClassifyLastUser.mockResolvedValueOnce({
        state: "DEFAULT",
        confidence: 0.3,
        zone: null,
        cue: null,
      });
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Qu'est-ce qui pèse le plus là ?",
            },
          },
        ],
      });
      const res = await postChat({
        messages: [{ role: "user", content: "je comprends pas ce qui se passe" }],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(mockClassifyLastUser).toHaveBeenCalledTimes(1);
      expect(mockClassifyLastUser).toHaveBeenCalledWith("je comprends pas ce qui se passe");
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(data.reply).toBeDefined();
    });

    it("somatic typo case1 (tenson ds cervicle) → shouldClassify true, classifieur appelé", async () => {
      mockClassifyLastUser.mockResolvedValueOnce({
        state: "SOMATIC_ACTIVE",
        confidence: 0.9,
        zone: "nuque",
        cue: true,
      });
      const res = await postChat({
        messages: [{ role: "user", content: "tenson ds cervicle" }],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(mockClassifyLastUser).toHaveBeenCalledTimes(1);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(data.mode).toBe("ASK");
    });

    it("quand rien match + classify returns DEFAULT → OpenAI appelé une fois", async () => {
      mockClassifyLastUser.mockResolvedValueOnce({
        state: "DEFAULT",
        confidence: 0.3,
        zone: null,
        cue: null,
      });
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Remarquez où ça se situe.",
            },
          },
        ],
      });
      const res = await postChat({
        messages: [{ role: "user", content: "je sais plus quoi dire" }],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(mockClassifyLastUser).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(data.reply).toBeDefined();
    });

    it("timeout classifieur (throw TIMEOUT) → route continue vers OpenAI, 200 OK", async () => {
      mockClassifyLastUser.mockRejectedValueOnce(new Error("TIMEOUT"));
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Qu'est-ce qui pèse le plus ?",
            },
          },
        ],
      });
      const res = await postChat({
        messages: [{ role: "user", content: "je comprends pas ce qui se passe" }],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.reply).toBeDefined();
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("timeout OpenAI (throw TIMEOUT) → route returns makeSafeAskReply (mode ASK), 200", async () => {
      mockClassifyLastUser.mockResolvedValueOnce({
        state: "DEFAULT",
        confidence: 0,
        zone: null,
        cue: null,
      });
      mockCreate.mockRejectedValueOnce(new Error("TIMEOUT"));
      const res = await postChat({
        messages: [{ role: "user", content: "qu'est-ce que je peux faire" }],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.mode).toBe("ASK");
      expect(data.reply).toMatch(/corps|remarquez|où/i);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("drift (réponse avec 'vous devriez') → makeSafeAskReply, OpenAI appelé une seule fois", async () => {
      mockClassifyLastUser.mockResolvedValueOnce({
        state: "DEFAULT",
        confidence: 0,
        zone: null,
        cue: null,
      });
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Vous devriez vous reposer un peu.",
            },
          },
        ],
      });
      const res = await postChat({
        messages: [{ role: "user", content: "je suis fatigué" }],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.mode).toBe("ASK");
      expect(data.reply).toMatch(/corps|remarquez|où|pèse|phrase/i);
      expect(data.reply).not.toMatch(/devriez|reposer/);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });
});
