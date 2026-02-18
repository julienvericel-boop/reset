/**
 * LOT 4 — GET /api/admin/analytics?token=...
 * Données pour le dashboard: KPIs + 50 dernières sessions. Aucun texte utilisateur.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminToken } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!isAdminToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [sessions, anonCounts] = await Promise.all([
      prisma.sessionAnalytics.findMany({
        orderBy: { startedAt: "desc" },
        take: 50,
        select: {
          id: true,
          sessionId: true,
          anonId: true,
          startedAt: true,
          endedAt: true,
          durationSec: true,
          exchangeCount: true,
          finalResult: true,
        },
      }),
      prisma.sessionAnalytics.groupBy({
        by: ["anonId"],
        _count: { id: true },
      }),
    ]);

    const totalSessions = await prisma.sessionAnalytics.count();
    const withResultAll = await prisma.sessionAnalytics.findMany({
      where: { finalResult: { not: null } },
      select: { finalResult: true },
    });
    const yesCount = withResultAll.filter((s) => s.finalResult === "yes").length;
    const someCount = withResultAll.filter((s) => s.finalResult === "some").length;
    const noCount = withResultAll.filter((s) => s.finalResult === "no").length;
    const totalWithResult = withResultAll.length;
    const pctYes = totalWithResult > 0 ? Math.round((yesCount / totalWithResult) * 100) : 0;
    const pctSome = totalWithResult > 0 ? Math.round((someCount / totalWithResult) * 100) : 0;
    const pctNo = totalWithResult > 0 ? Math.round((noCount / totalWithResult) * 100) : 0;

    const ended = await prisma.sessionAnalytics.findMany({
      where: { endedAt: { not: null } },
      select: { durationSec: true, exchangeCount: true },
    });
    const withDuration = ended.filter((s) => s.durationSec != null) as { durationSec: number }[];
    const avgDurationSec =
      withDuration.length > 0
        ? Math.round(
            withDuration.reduce((a, s) => a + s.durationSec, 0) / withDuration.length
          )
        : null;
    const avgExchanges =
      ended.length > 0
        ? Math.round(ended.reduce((a, s) => a + s.exchangeCount, 0) / ended.length)
        : null;

    const uniqueAnonIds = anonCounts.length;
    const returningCount = anonCounts.filter((a) => a._count.id >= 2).length;
    const pctReturning = uniqueAnonIds > 0 ? Math.round((returningCount / uniqueAnonIds) * 100) : 0;

    return NextResponse.json({
      kpis: {
        totalSessions,
        pctYes,
        pctSome,
        pctNo,
        totalWithResult,
        avgDurationSec,
        avgExchanges,
        uniqueAnonIds,
        pctReturning,
      },
      sessions,
    });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
