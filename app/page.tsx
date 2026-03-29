"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Incident, StatusResponse } from "@/lib/types";
import Link from "next/link";

export default function Home() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [incidentQuery, setIncidentQuery] = useState("");
  const [incidentStatus, setIncidentStatus] = useState<"all" | "open" | "resolved">("all");
  const [incidentSort, setIncidentSort] = useState<"newest" | "oldest" | "severity" | "duration">("newest");
  const [incidentDay, setIncidentDay] = useState<string | null>(null);

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
  const incidents = useMemo(() => data?.incidents ?? [], [data?.incidents]);

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
  const uptime24h =
    data?.stats?.uptime24hPercent != null ? `${data.stats.uptime24hPercent.toFixed(2)}%` : "—";
  const p95Latency =
    data?.stats?.p95LatencyMs != null ? `${Math.round(data.stats.p95LatencyMs)} ms` : "—";
  const p50Latency =
    data?.stats?.p50LatencyMs != null ? `${Math.round(data.stats.p50LatencyMs)} ms` : "—";
  const recentChecks = useMemo(() => data?.recentChecks ?? [], [data?.recentChecks]);

  const displayedIncidents = useMemo(() => {
    const severityRank = (s: Incident["severity"]) => (s === "critical" ? 3 : s === "major" ? 2 : 1);
    const dayOf = (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toISOString().slice(0, 10);
    };
    const durationMs = (i: Incident) => {
      const start = new Date(i.createdAt).getTime();
      const end = new Date(i.resolvedAt ?? new Date().toISOString()).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
      return Math.max(0, end - start);
    };

    const q = incidentQuery.trim().toLowerCase();

    const filtered = incidents.filter((i) => {
      if (incidentStatus !== "all" && i.status !== incidentStatus) return false;
      if (incidentDay && dayOf(i.createdAt) !== incidentDay) return false;
      if (!q) return true;
      const hay = [i.title, i.summary, i.cause, i.resolution].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });

    const sorted = [...filtered].sort((a, b) => {
      if (incidentSort === "oldest") return a.createdAt.localeCompare(b.createdAt);
      if (incidentSort === "severity") return severityRank(b.severity) - severityRank(a.severity);
      if (incidentSort === "duration") return durationMs(b) - durationMs(a);
      return b.createdAt.localeCompare(a.createdAt);
    });

    return sorted;
  }, [incidents, incidentDay, incidentQuery, incidentSort, incidentStatus]);

  const uptimeBar = useMemo(() => {
    const dayOf = (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    };

    return {
      bars: [...recentChecks].slice(0, 90).reverse(),
      onSelect: (iso: string) => {
        const day = dayOf(iso);
        if (!day) return;
        setIncidentDay(day);
        const el = document.getElementById("incidents");
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    };
  }, [recentChecks]);

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
            <Link href="/incidents" className="hover:text-zinc-100">
              Incidents
            </Link>
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
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
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
            <StatCard title="Uptime (24h)" value={uptime24h} detail={`p95: ${p95Latency} • p50: ${p50Latency}`} />
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
            <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold tracking-tight text-zinc-100">Uptime</h2>
                <p className="text-xs text-zinc-400">
                  Uptime (24h): <span className="font-mono text-zinc-200">{uptime24h}</span> • p95: <span className="font-mono text-zinc-200">{p95Latency}</span> • p50: <span className="font-mono text-zinc-200">{p50Latency}</span>
                </p>
                <p className="text-xs text-zinc-500">Last {uptimeBar.bars.length} checks • click a bar to filter incidents by day</p>
              </div>
              <a href="#incidents" className="text-sm text-zinc-300 hover:text-zinc-100">
                View incidents
              </a>
            </div>

            <div className="px-6 py-6">
              {loading ? (
                <div className="text-sm text-zinc-400">Loading uptime…</div>
              ) : uptimeBar.bars.length === 0 ? (
                <div className="text-sm text-zinc-400">No check history yet.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {uptimeBar.bars.map((check) => {
                    const color =
                      check.status === "operational"
                        ? "bg-emerald-500"
                        : check.status === "degraded"
                          ? "bg-amber-500"
                          : "bg-rose-500";

                    const label = `${check.status.toUpperCase()} • ${formatTimestamp(check.at)}${
                      check.latencyMs != null ? ` • ${Math.round(check.latencyMs)} ms` : ""
                    }`.replace("$", "");

                    return (
                      <div key={check.at} className="group relative">
                        <button
                          type="button"
                          onClick={() => uptimeBar.onSelect(check.at)}
                          aria-label={label}
                          className={`h-7 w-1.5 rounded-sm ${color} opacity-90 transition-[transform,opacity,width] duration-150 ease-out hover:w-2 hover:opacity-100 hover:scale-y-[1.15] focus:outline-none focus:ring-2 focus:ring-white/30`}
                        />
                        <div className="pointer-events-none absolute -top-2 left-1/2 z-20 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-xs text-zinc-100 shadow-xl backdrop-blur group-hover:block">
                          <div className="font-medium">{check.status.toUpperCase()}</div>
                          <div className="text-zinc-300">{formatTimestamp(check.at)}</div>
                          <div className="text-zinc-300">
                            {check.latencyMs != null ? `${Math.round(check.latencyMs)} ms` : "—"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {incidentDay ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
                  <span className="rounded-full bg-white/5 px-3 py-1">
                    Filtering incidents for <span className="font-mono">{incidentDay}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIncidentDay(null)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 hover:bg-white/10"
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <section id="incidents" className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
            <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold tracking-tight text-zinc-100">Incident history</h2>
                <p className="text-xs text-zinc-400">Last 24 hours</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  value={incidentQuery}
                  onChange={(e) => setIncidentQuery(e.target.value)}
                  placeholder="Search incidents…"
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-white/20 sm:w-56"
                />

                <select
                  value={incidentStatus}
                  onChange={(e) => setIncidentStatus(e.target.value as typeof incidentStatus)}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-white/20"
                >
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </select>

                <select
                  value={incidentSort}
                  onChange={(e) => setIncidentSort(e.target.value as typeof incidentSort)}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-white/20"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="severity">Severity</option>
                  <option value="duration">Duration</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setRefreshing(true);
                    fetchStatus();
                  }}
                  disabled={loading || refreshing}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="px-6 py-10 text-sm text-zinc-400">Loading status…</div>
            ) : displayedIncidents.length === 0 ? (
              <div className="px-6 py-10 text-sm text-zinc-400">No incidents match your filters.</div>
            ) : (
              <ul className="divide-y divide-white/10">
                {displayedIncidents.map((incident) => (
                  <IncidentRow key={incident.id} incident={incident} />
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold tracking-tight text-zinc-100">
                  Recent checks
                </h2>
                <p className="text-xs text-zinc-400">Last {recentChecks.length} runs</p>
              </div>
            </div>

            {loading ? (
              <div className="px-6 py-10 text-sm text-zinc-400">Loading checks…</div>
            ) : recentChecks.length === 0 ? (
              <div className="px-6 py-10 text-sm text-zinc-400">
                No check history yet. Schedule <span className="font-mono text-zinc-300">/api/monitor</span>{" "}
                with cron-job.org.
              </div>
            ) : (
              <ul className="divide-y divide-white/10">
                {recentChecks.map((check) => (
                  <li key={check.at} className="px-6 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                            check.status === "operational"
                              ? "bg-emerald-500/10 text-emerald-300"
                              : check.status === "degraded"
                                ? "bg-amber-500/10 text-amber-300"
                                : "bg-rose-500/10 text-rose-300"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              check.status === "operational"
                                ? "bg-emerald-400"
                                : check.status === "degraded"
                                  ? "bg-amber-400"
                                  : "bg-rose-400"
                            }`}
                          />
                          {check.status.toUpperCase()}
                        </span>
                        <span className="text-sm text-zinc-200">{formatTimestamp(check.at)}</span>
                      </div>
                      <div className="text-sm text-zinc-400">
                        {check.latencyMs != null ? `${Math.round(check.latencyMs)} ms` : "—"}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <footer className="mt-12 border-t border-white/10 pt-6 text-sm text-zinc-400">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/incidents" className="hover:text-zinc-100">
              ← Incident History
            </Link>
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
