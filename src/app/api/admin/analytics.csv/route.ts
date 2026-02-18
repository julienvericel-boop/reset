/**
 * LOT 4 — GET /api/admin/analytics.csv?token=...
 * Export CSV des sessions. Aucun texte utilisateur.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminToken } from "@/lib/adminAuth";

function escapeCsv(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!isAdminToken(token)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const rows = await prisma.sessionAnalytics.findMany({
      orderBy: { startedAt: "desc" },
      select: {
        sessionId: true,
        anonId: true,
        startedAt: true,
        endedAt: true,
        durationSec: true,
        exchangeCount: true,
        finalResult: true,
      },
    });

    const header = "sessionId,anonId,startedAt,endedAt,durationSec,exchangeCount,finalResult";
    const lines = rows.map(
      (r) =>
        [
          escapeCsv(r.sessionId),
          escapeCsv(r.anonId),
          r.startedAt.toISOString(),
          r.endedAt ? r.endedAt.toISOString() : "",
          r.durationSec ?? "",
          r.exchangeCount,
          r.finalResult ?? "",
        ].join(",")
    );
    const csv = [header, ...lines].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="analytics.csv"',
      },
    });
  } catch {
    return new NextResponse("Error", { status: 500 });
  }
}
