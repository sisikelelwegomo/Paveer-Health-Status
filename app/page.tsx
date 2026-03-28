"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Incident, StatusResponse } from "@/lib/types";
import Link from "next/link";

export default function Home() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const json = (await res.json()) as StatusResponse;
      setData(json);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 30_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const status = data?.status ?? "operational";
  const monitoredUrl = data?.monitoredUrl ?? "https://paveer.com";
  const incidents = data?.incidents ?? [];

  const statusLabel = useMemo(() => {
    if (status === "operational") return "Operational";
    if (status === "degraded") return "Degraded";
    return "Down";
  }, [status]);

  const statusClasses = useMemo(() => {
    if (status === "operational") return "bg-emerald-500/10 text-emerald-700";
    if (status === "degraded") return "bg-amber-500/10 text-amber-700";
    return "bg-rose-500/10 text-rose-700";
  }, [status]);

  const statusDotClasses = useMemo(() => {
    if (status === "operational") return "bg-emerald-500";
    if (status === "degraded") return "bg-amber-500";
    return "bg-rose-500";
  }, [status]);

  const lastChecked = data?.lastCheckedAt ? formatTimestamp(data.lastCheckedAt) : "—";
  const lastChange = data?.lastStateChangeAt ? formatTimestamp(data.lastStateChangeAt) : "—";
  const latency = data?.lastLatencyMs != null ? `${data.lastLatencyMs} ms` : "—";

  const downtime = useMemo(() => {
    if (status !== "down") return null;
    if (!data?.downtimeStartedAt) return null;

    const start = new Date(data.downtimeStartedAt);
    const now = new Date();
    const duration = formatDuration(start, now);

    return {
      since: formatTimestamp(data.downtimeStartedAt),
      duration,
    };
  }, [data?.downtimeStartedAt, status]);

  return (
    <div className="relative min-h-screen bg-[#050608] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -top-32 right-[-260px] h-[440px] w-[640px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-[-240px] left-[-260px] h-[520px] w-[720px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-6 py-12">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5">
              <div className="h-3.5 w-3.5 rounded-sm bg-gradient-to-br from-emerald-400 to-sky-400" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-wide text-zinc-100">
                Paveer
              </span>
              <span className="text-xs text-zinc-400">System Health</span>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm text-zinc-300">
            <a
              href={monitoredUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-100"
            >
              Monitored Site
            </a>
            <a href="/api/status" className="hover:text-zinc-100">
              Status JSON
            </a>
            <Link href="/admin" className="hover:text-zinc-100">
              Admin
            </Link>
          </div>
        </nav>

        <header className="mt-12">
          <div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-10 backdrop-blur">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium tracking-[0.22em] text-zinc-400">
                  NEVER MISS A CHECK
                </p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Paveer System Health
                </h1>
                <p className="text-sm text-zinc-400">
                  Monitoring{" "}
                  <a
                    href={monitoredUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-zinc-200 underline underline-offset-4 hover:text-zinc-100"
                  >
                    {monitoredUrl}
                  </a>
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 sm:items-end">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${statusClasses}`}
                >
                  <span className={`h-2 w-2 rounded-full ${statusDotClasses}`} />
                  {statusLabel}
                </span>
                {downtime ? (
                  <span className="text-xs text-zinc-400">
                    Down for {downtime.duration} • since {downtime.since}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className="mt-10 flex flex-col gap-10">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              title="Current status"
              value={statusLabel}
              detail={`Last checked: ${lastChecked}`}
            />
            <StatCard title="Latest latency" value={latency} detail="Last successful check" />
            <StatCard
              title="Incidents (24h)"
              value={`${incidents.length}`}
              detail={`Last change: ${lastChange}`}
            />
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold tracking-tight text-zinc-100">
                  Incident history
                </h2>
                <p className="text-xs text-zinc-400">Last 24 hours</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setRefreshing(true);
                  fetchStatus();
                }}
                disabled={loading || refreshing}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {loading ? (
              <div className="px-6 py-10 text-sm text-zinc-400">Loading status…</div>
            ) : incidents.length === 0 ? (
              <div className="px-6 py-10 text-sm text-zinc-400">
                No incidents reported in the last 24 hours.
              </div>
            ) : (
              <ul className="divide-y divide-white/10">
                {incidents.map((incident) => (
                  <IncidentRow key={incident.id} incident={incident} />
                ))}
              </ul>
            )}
          </section>
        </main>

        <footer className="mt-12 border-t border-white/10 pt-6 text-sm text-zinc-400">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Auto-refreshes every 30 seconds.</span>
            <span className="text-xs">
              Tip: schedule GET{" "}
              <span className="font-mono text-zinc-300">/api/monitor</span> for
              continuous monitoring
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function StatCard(props: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <div className="text-xs font-medium tracking-[0.2em] text-zinc-400">
        {props.title.toUpperCase()}
      </div>
      <div className="mt-3 text-2xl font-semibold text-zinc-100">{props.value}</div>
      <div className="mt-3 text-sm text-zinc-400">{props.detail}</div>
    </div>
  );
}

function IncidentRow({ incident }: { incident: Incident }) {
  const severity = incident.severity;
  const severityClasses =
    severity === "minor"
      ? "bg-amber-500/10 text-amber-300"
      : severity === "major"
        ? "bg-rose-500/10 text-rose-300"
        : "bg-fuchsia-500/10 text-fuchsia-300";

  const categoryClasses =
    incident.category === "engineering"
      ? "bg-sky-500/10 text-sky-300"
      : incident.category === "product"
        ? "bg-violet-500/10 text-violet-300"
        : "bg-emerald-500/10 text-emerald-300";

  const urgencyClasses =
    incident.urgency === "high"
      ? "bg-white/10 text-zinc-200"
      : "bg-white/5 text-zinc-300";

  const plannedClasses = incident.planned
    ? "bg-white/5 text-zinc-300"
    : "bg-white/10 text-zinc-200";

  const statusClasses =
    incident.status === "resolved"
      ? "bg-emerald-500/10 text-emerald-300"
      : "bg-white/10 text-zinc-200";

  return (
    <li className="px-6 py-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="text-base font-semibold">{incident.title}</div>
          {incident.summary ? (
            <div className="text-sm text-zinc-400">{incident.summary}</div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${categoryClasses}`}>
            {incident.category.toUpperCase()}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${urgencyClasses}`}>
            {incident.urgency === "high" ? "HIGH URGENCY" : "LOW URGENCY"}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${plannedClasses}`}>
            {incident.planned ? "PLANNED" : "UNPLANNED"}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${severityClasses}`}>
            {severity.toUpperCase()}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClasses}`}>
            {incident.status === "resolved" ? "RESOLVED" : "OPEN"}
          </span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-zinc-300">Start</dt>
          <dd className="text-zinc-400">{formatTimestamp(incident.createdAt)}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-300">End</dt>
          <dd className="text-zinc-400">
            {incident.resolvedAt ? formatTimestamp(incident.resolvedAt) : "Ongoing"}
          </dd>
        </div>
        {incident.cause ? (
          <div className="sm:col-span-2">
            <dt className="font-medium text-zinc-300">Cause</dt>
            <dd className="text-zinc-400">{incident.cause}</dd>
          </div>
        ) : null}
        {incident.resolution ? (
          <div className="sm:col-span-2">
            <dt className="font-medium text-zinc-300">Resolution</dt>
            <dd className="text-zinc-400">{incident.resolution}</dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function formatDuration(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime();
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}
