/**
 * LOT 4 — POST /api/analytics/start
 * Body: { anonId, sessionId, userAgent? }
 * Pas de texte utilisateur. Jamais logger le body.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function pickBody(body: unknown): { anonId?: string; sessionId?: string; userAgent?: string } {
  if (!body || typeof body !== "object") return {};
  const o = body as Record<string, unknown>;
  return {
    anonId: typeof o.anonId === "string" ? o.anonId.slice(0, 64) : undefined,
    sessionId: typeof o.sessionId === "string" ? o.sessionId.slice(0, 64) : undefined,
    userAgent: typeof o.userAgent === "string" ? o.userAgent.slice(0, 512) : undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { anonId, sessionId, userAgent } = pickBody(body);
    if (!anonId || !sessionId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const now = new Date();
    await prisma.sessionAnalytics.upsert({
      where: { sessionId },
      create: {
        anonId,
        sessionId,
        startedAt: now,
        exchangeCount: 0,
        userAgent: userAgent ?? null,
      },
      update: {
        startedAt: now,
        endedAt: null,
        durationSec: null,
        exchangeCount: 0,
        finalResult: null,
        userAgent: userAgent ?? undefined,
        updatedAt: now,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
