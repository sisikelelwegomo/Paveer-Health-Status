"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type StatusApiResponse = {
  targetUrl: string;
  status: "operational" | "degraded" | "down";
  statusText: string;
  monitor: {
    id: string;
    status: string | null;
    lastCheckedAt: string | null;
    name: string | null;
    url: string | null;
  };
  incidents: Array<{
    id: string;
    name: string;
    url: string | null;
    cause: string | null;
    startedAt: string | null;
    resolvedAt: string | null;
    status: string | null;
  }>;
  generatedAt: string;
  error?: string | null;
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function statusStyles(status: StatusApiResponse["status"]) {
  switch (status) {
    case "operational":
      return {
        pill: "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-900",
        dot: "bg-emerald-600",
      };
    case "down":
      return {
        pill: "bg-red-100 text-red-950 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-50 dark:ring-red-900",
        dot: "bg-red-600",
      };
    case "degraded":
    default:
      return {
        pill: "bg-amber-100 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-900",
        dot: "bg-amber-600",
      };
  }
}

export default function Home() {
  const [data, setData] = useState<StatusApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      const json = JSON.parse(text) as StatusApiResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const styles = useMemo(() => statusStyles(data?.status ?? "degraded"), [data?.status]);

  return (
    <div className="min-h-full flex flex-col bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <header className="w-full border-b border-zinc-200/70 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-black/40">
        <div className="mx-auto w-full max-w-4xl px-6 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-tight">Paveer System Health</h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Monitoring{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {data?.targetUrl ?? "—"}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${styles.pill}`}>
                <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
                {data?.statusText ?? (isLoading ? "Loading…" : "Unknown")}
              </span>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-white/15 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
              >
                Refresh
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
            <div>
              Last checked:{" "}
              <span className="text-zinc-900 dark:text-zinc-100">
                {formatDateTime(data?.monitor.lastCheckedAt ?? null)}
              </span>
            </div>
            <div>
              Generated:{" "}
              <span className="text-zinc-900 dark:text-zinc-100">
                {formatDateTime(data?.generatedAt ?? null)}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Incidents (last 24 hours)</h2>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              {data ? `${data.incidents.length} found` : isLoading ? "Loading…" : "—"}
            </div>
          </div>

          {data?.error ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-50">
              {data.error}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-50">
              {error}
            </div>
          ) : null}

          {isLoading && !data ? (
            <div className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">Loading status…</div>
          ) : null}

          {!isLoading && data && data.incidents.length === 0 ? (
            <div className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
              No incidents in the last 24 hours.
            </div>
          ) : null}

          {data && data.incidents.length > 0 ? (
            <ul className="mt-6 flex flex-col gap-3">
              {data.incidents.map((incident) => (
                <li
                  key={incident.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black/20"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                        {incident.name || "Incident"}
                      </div>
                      <div className="text-sm text-zinc-600 dark:text-zinc-400">
                        {incident.cause ?? "—"}
                      </div>
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      {incident.status ?? "—"}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-zinc-600 dark:text-zinc-400 sm:grid-cols-2">
                    <div>
                      Started:{" "}
                      <span className="text-zinc-900 dark:text-zinc-100">
                        {formatDateTime(incident.startedAt)}
                      </span>
                    </div>
                    <div>
                      Resolved:{" "}
                      <span className="text-zinc-900 dark:text-zinc-100">
                        {formatDateTime(incident.resolvedAt)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </main>

      <footer className="border-t border-zinc-200/70 bg-white/70 py-6 text-sm text-zinc-600 backdrop-blur dark:border-white/10 dark:bg-black/40 dark:text-zinc-400">
        <div className="mx-auto w-full max-w-4xl px-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>Public status page</div>
            <div className="font-mono">
              /api/status
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
