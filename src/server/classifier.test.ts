import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

async function classify(text: string) {
  const { classifyLastUser } = await import("./classifier");
  return classifyLastUser(text);
}

describe("classifyLastUser", () => {
  const env = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "sk-test";
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = env;
  });

  it("parse JSON et retourne champs state, confidence, zone, cue", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              state: "DEFAULT",
              confidence: 0.8,
              zone: null,
              cue: null,
            }),
          },
        },
      ],
    });
    const r = await classify("je ne sais pas");
    expect(r).toHaveProperty("state", "DEFAULT");
    expect(r).toHaveProperty("confidence");
    expect(r).toHaveProperty("zone");
    expect(r).toHaveProperty("cue");
    expect(typeof r.confidence).toBe("number");
  });

  it("insultes -> ALLIANCE_REPAIR", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              state: "ALLIANCE_REPAIR",
              confidence: 0.95,
              zone: null,
              cue: null,
            }),
          },
        },
      ],
    });
    const r = await classify("tu m'écoutes pas, t'es nul");
    expect(r.state).toBe("ALLIANCE_REPAIR");
  });

  it("'ça sert à rien' -> STAGNATION", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              state: "STAGNATION",
              confidence: 0.9,
              zone: null,
              cue: null,
            }),
          },
        },
      ],
    });
    const r = await classify("ça sert à rien");
    expect(r.state).toBe("STAGNATION");
  });

  it("'je veux mourir' -> SELF_HARM", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              state: "SELF_HARM",
              confidence: 1,
              zone: null,
              cue: null,
            }),
          },
        },
      ],
    });
    const r = await classify("je veux mourir");
    expect(r.state).toBe("SELF_HARM");
  });

  it("'je suis en panique' -> PANIC", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              state: "PANIC",
              confidence: 0.9,
              zone: null,
              cue: null,
            }),
          },
        },
      ],
    });
    const r = await classify("je suis en panique");
    expect(r.state).toBe("PANIC");
  });

  it("fautes 'c est serre a la gorje' -> SOMATIC_ACTIVE, cue true, zone non null", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              state: "SOMATIC_ACTIVE",
              confidence: 0.85,
              zone: "gorge",
              cue: true,
            }),
          },
        },
      ],
    });
    const r = await classify("c est serre a la gorje");
    expect(r.state).toBe("SOMATIC_ACTIVE");
    expect(r.cue).toBe(true);
    expect(r.zone).toBeTruthy();
    expect(r.zone).toBe("gorge");
  });

  it("JSON invalide ou état inconnu -> DEFAULT, confidence 0", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "pas du json" } }],
    });
    const r = await classify("n'importe quoi");
    expect(r.state).toBe("DEFAULT");
    expect(r.confidence).toBe(0);
    expect(r.zone).toBeNull();
    expect(r.cue).toBeNull();
  });

  it("texte vide -> DEFAULT sans appeler OpenAI", async () => {
    const r = await classify("");
    expect(r.state).toBe("DEFAULT");
    expect(r.confidence).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
