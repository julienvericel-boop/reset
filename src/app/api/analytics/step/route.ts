/**
 * LOT 4 — POST /api/analytics/step
 * Body: { anonId, sessionId }
 * Incrémente exchangeCount. Pas de texte utilisateur.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function pickBody(body: unknown): { anonId?: string; sessionId?: string } {
  if (!body || typeof body !== "object") return {};
  const o = body as Record<string, unknown>;
  return {
    anonId: typeof o.anonId === "string" ? o.anonId.slice(0, 64) : undefined,
    sessionId: typeof o.sessionId === "string" ? o.sessionId.slice(0, 64) : undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { anonId, sessionId } = pickBody(body);
    if (!anonId || !sessionId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const now = new Date();
    const existing = await prisma.sessionAnalytics.findUnique({ where: { sessionId } });
    if (existing) {
      await prisma.sessionAnalytics.update({
        where: { sessionId },
        data: { exchangeCount: { increment: 1 }, updatedAt: now },
      });
    } else {
      await prisma.sessionAnalytics.create({
        data: {
          anonId,
          sessionId,
          startedAt: now,
          exchangeCount: 1,
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
