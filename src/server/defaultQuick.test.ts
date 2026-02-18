import { describe, it, expect } from "vitest";
import {
  isDefaultQuick,
  pickDefaultQuickReply,
  type QuestionType,
} from "./defaultQuick";
import { isForbiddenStyle } from "@/app/api/chat/guardrails";

describe("defaultQuick", () => {
  describe("isDefaultQuick", () => {
    it("'ok' -> true", () => {
      expect(isDefaultQuick("ok")).toBe(true);
    });
    it("'je sais pas' -> true", () => {
      expect(isDefaultQuick("je sais pas")).toBe(true);
    });
    it("'aide' -> true", () => {
      expect(isDefaultQuick("aide")).toBe(true);
    });
    it("'peux tu m'aider' -> false (trop long, >12)", () => {
      expect(isDefaultQuick("peux tu m'aider")).toBe(false);
    });
    it("'je suis en panique' -> false (reste PANIC local)", () => {
      expect(isDefaultQuick("je suis en panique")).toBe(false);
    });
    it("'...' / '…' -> true", () => {
      expect(isDefaultQuick("...")).toBe(true);
      expect(isDefaultQuick("…")).toBe(true);
    });
    it("'?' -> true", () => {
      expect(isDefaultQuick("?")).toBe(true);
    });
    it("'jsp' -> true", () => {
      expect(isDefaultQuick("jsp")).toBe(true);
    });
  });

  describe("pickDefaultQuickReply", () => {
    it("'ok' -> reply non vide, mode ASK, qtype défini", () => {
      const res = pickDefaultQuickReply("ok");
      expect(res.reply).toBeTruthy();
      expect(res.reply.length).toBeLessThanOrEqual(300);
      expect(res.mode).toBe("ASK");
      expect(res.meta?.qtype).toBeDefined();
      const qtypes: QuestionType[] = [
        "DQ_ANCHOR",
        "DQ_INTENSITY",
        "DQ_ONE_WORD",
        "DQ_HEAD_BODY",
        "DQ_LOCATION_CHOICE",
      ];
      expect(qtypes).toContain(res.meta!.qtype);
    });

    it("reply <= 300 car, max 1 '?'", () => {
      for (const input of ["ok", "aide", "je sais pas"]) {
        const res = pickDefaultQuickReply(input);
        expect(res.reply.length).toBeLessThanOrEqual(300);
        const qCount = (res.reply.match(/\?/g) || []).length;
        expect(qCount).toBeLessThanOrEqual(1);
      }
    });

    it("aucun template ne contient de mots interdits (isForbiddenStyle)", () => {
      const inputs = ["ok", "aide", "...", "jsp", "hein"];
      for (const input of inputs) {
        const res = pickDefaultQuickReply(input);
        expect(isForbiddenStyle(res.reply)).toBe(false);
      }
      const allTemplates = [
        "Ok. C'est surtout dans la tête, dans le corps, ou les deux ?",
        "Ok. Intensité là, de 1 à 5 ?",
        "Ok. Un seul mot pour ce qui est là ?",
        "Ok. Où ça serre le plus : gorge, poitrine, ventre ou nuque ?",
        "Ok. En une phrase : qu'est-ce qui tourne le plus là ?",
      ];
      for (const t of allTemplates) {
        expect(isForbiddenStyle(t)).toBe(false);
      }
    });
  });
});
