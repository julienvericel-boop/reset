"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, Suspense } from "react";

type Kpis = {
  totalSessions: number;
  pctYes: number;
  pctSome: number;
  pctNo: number;
  totalWithResult: number;
  avgDurationSec: number | null;
  avgExchanges: number | null;
  uniqueAnonIds: number;
  pctReturning: number;
};

type SessionRow = {
  id: string;
  sessionId: string;
  anonId: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  exchangeCount: number;
  finalResult: string | null;
};

function truncate(s: string, len: number) {
  if (s.length <= len) return s;
  return s.slice(0, len) + "…";
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function AdminAnalyticsContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token) {
      setAuthorized(false);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/analytics?token=${encodeURIComponent(token)}`);
      if (res.status === 401) {
        setAuthorized(false);
        setKpis(null);
        setSessions([]);
      } else {
        setAuthorized(true);
        const data = await res.json();
        setKpis(data.kpis ?? null);
        setSessions(data.sessions ?? []);
      }
    } catch {
      setAuthorized(false);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <main className="min-h-screen p-6 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
        <p className="text-sm text-neutral-500">Chargement…</p>
      </main>
    );
  }

  if (!authorized || !token) {
    return (
      <main className="min-h-screen p-6 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
        <h1 className="text-lg font-medium">Unauthorized</h1>
        <p className="text-sm text-neutral-500 mt-1">Token manquant ou invalide.</p>
      </main>
    );
  }

  const csvUrl = `/api/admin/analytics.csv?token=${encodeURIComponent(token)}`;

  return (
    <main className="min-h-screen p-6 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-xl font-semibold">LOT 4 — Analytics</h1>
        <a
          href={csvUrl}
          download="analytics.csv"
          className="px-4 py-2 rounded-lg bg-neutral-800 text-white text-sm hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-900"
        >
          Export CSV
        </a>
      </div>

      {kpis && (
        <section className="mb-8 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Sessions totales</p>
            <p className="text-2xl font-semibold mt-1">{kpis.totalSessions}</p>
          </div>
          <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Oui / Un peu / Non</p>
            <p className="text-lg font-medium mt-1">
              {kpis.pctYes}% / {kpis.pctSome}% / {kpis.pctNo}%
            </p>
            <p className="text-xs text-neutral-500">sur {kpis.totalWithResult} avec résultat</p>
          </div>
          <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Durée moy. (s)</p>
            <p className="text-2xl font-semibold mt-1">{kpis.avgDurationSec ?? "—"}</p>
          </div>
          <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Échanges moy.</p>
            <p className="text-2xl font-semibold mt-1">{kpis.avgExchanges ?? "—"}</p>
          </div>
          <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">AnonId uniques</p>
            <p className="text-2xl font-semibold mt-1">{kpis.uniqueAnonIds}</p>
          </div>
          <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">% Revenants</p>
            <p className="text-2xl font-semibold mt-1">{kpis.pctReturning}%</p>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium mb-3">50 dernières sessions</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-700">
                <th className="text-left p-3">startedAt</th>
                <th className="text-left p-3">durationSec</th>
                <th className="text-left p-3">exchangeCount</th>
                <th className="text-left p-3">finalResult</th>
                <th className="text-left p-3">anonId</th>
                <th className="text-left p-3">sessionId</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-neutral-100 dark:border-neutral-700">
                  <td className="p-3">{formatDate(s.startedAt)}</td>
                  <td className="p-3">{s.durationSec ?? "—"}</td>
                  <td className="p-3">{s.exchangeCount}</td>
                  <td className="p-3">{s.finalResult ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{truncate(s.anonId, 8)}</td>
                  <td className="p-3 font-mono text-xs">{truncate(s.sessionId, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sessions.length === 0 && (
            <p className="p-6 text-neutral-500 text-center">Aucune session.</p>
          )}
        </div>
      </section>
    </main>
  );
}

export default function AdminAnalyticsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen p-6"><p className="text-sm text-neutral-500">Chargement…</p></main>}>
      <AdminAnalyticsContent />
    </Suspense>
  );
}
