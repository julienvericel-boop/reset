/**
 * LOT 4 — POST /api/analytics/end
 * Body: { anonId, sessionId, finalResult?: "yes"|"some"|"no" }
 * endedAt=now, durationSec, finalResult. Pas de texte utilisateur.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_FINAL = new Set(["yes", "some", "no"]);

function pickBody(
  body: unknown
): { anonId?: string; sessionId?: string; finalResult?: string | null } {
  if (!body || typeof body !== "object") return {};
  const o = body as Record<string, unknown>;
  const fr = o.finalResult;
  const finalResult =
    fr === null || fr === undefined
      ? undefined
      : VALID_FINAL.has(String(fr)) ? String(fr) : undefined;
  return {
    anonId: typeof o.anonId === "string" ? o.anonId.slice(0, 64) : undefined,
    sessionId: typeof o.sessionId === "string" ? o.sessionId.slice(0, 64) : undefined,
    finalResult,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { anonId, sessionId, finalResult } = pickBody(body);
    if (!anonId || !sessionId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const now = new Date();
    const existing = await prisma.sessionAnalytics.findUnique({ where: { sessionId } });
    if (existing) {
      const startedAt = existing.startedAt;
      const durationSec = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
      await prisma.sessionAnalytics.update({
        where: { sessionId },
        data: {
          endedAt: now,
          durationSec,
          finalResult: finalResult ?? null,
          updatedAt: now,
        },
      });
    } else {
      await prisma.sessionAnalytics.create({
        data: {
          anonId,
          sessionId,
          startedAt: now,
          endedAt: now,
          durationSec: 0,
          exchangeCount: 0,
          finalResult: finalResult ?? null,
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
