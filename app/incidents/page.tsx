"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Incident, StatusResponse } from "@/lib/types";

type IncidentStatusFilter = "all" | "open" | "resolved";
type IncidentSort = "newest" | "oldest" | "severity" | "duration";

export default function IncidentsPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [incidentQuery, setIncidentQuery] = useState("");
  const [incidentStatus, setIncidentStatus] = useState<IncidentStatusFilter>("all");
  const [incidentSort, setIncidentSort] = useState<IncidentSort>("newest");

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

  const monitoredUrl = data?.monitoredUrl ?? "https://paveer.com";
  const incidents = useMemo(() => data?.incidents ?? [], [data?.incidents]);

  const displayedIncidents = useMemo(() => {
    const severityRank = (s: Incident["severity"]) =>
      s === "critical" ? 3 : s === "major" ? 2 : 1;

    const durationMs = (i: Incident) => {
      const start = new Date(i.createdAt).getTime();
      const end = new Date(i.resolvedAt ?? new Date().toISOString()).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
      return Math.max(0, end - start);
    };

    const q = incidentQuery.trim().toLowerCase();

    const filtered = incidents.filter((i) => {
      if (incidentStatus !== "all" && i.status !== incidentStatus) return false;
      if (!q) return true;
      const hay = [i.title, i.summary, i.cause, i.resolution]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    return [...filtered].sort((a, b) => {
      if (incidentSort === "oldest") return a.createdAt.localeCompare(b.createdAt);
      if (incidentSort === "severity") return severityRank(b.severity) - severityRank(a.severity);
      if (incidentSort === "duration") return durationMs(b) - durationMs(a);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [incidents, incidentQuery, incidentSort, incidentStatus]);

  return (
    <div className="relative min-h-screen bg-[#050608] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -top-32 right-[-260px] h-[440px] w-[640px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-[-240px] left-[-260px] h-[520px] w-[720px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-6 py-12">
        <nav className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-3 text-sm font-medium text-zinc-300 hover:text-zinc-100"
          >
            <div className="grid h-9 w-9 place-items-center border border-white/10 bg-white/5">
              <Image
                src="/vercel.png"
                alt="Logo"
                width={24}
                height={24}
                className="h-6 w-6 object-contain"
                priority
              />
            </div>
            <span>Back to status</span>
          </Link>

          <div className="flex items-center gap-6 text-sm text-zinc-300">
            <a href={monitoredUrl} target="_blank" rel="noreferrer" className="hover:text-zinc-100">
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

        <header className="mt-10">
          <div className="rounded-none border border-white/10 bg-white/5 px-8 py-10 backdrop-blur">
            <p className="text-xs font-medium tracking-[0.22em] text-zinc-400">INCIDENT HISTORY</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">All incidents</h1>
            <p className="mt-2 text-sm text-zinc-400">
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
        </header>

        <main className="mt-10">
          <section className="rounded-none border border-white/10 bg-white/5 backdrop-blur">
            <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold tracking-tight text-zinc-100">Browse</h2>
                <p className="text-xs text-zinc-400">
                  {loading ? "Loading…" : `${displayedIncidents.length} shown • ${incidents.length} total`}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  value={incidentQuery}
                  onChange={(e) => setIncidentQuery(e.target.value)}
                  placeholder="Search incidents…"
                  className="h-10 w-full rounded-none border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-white/20 sm:w-64"
                />

                <select
                  value={incidentStatus}
                  onChange={(e) => setIncidentStatus(e.target.value as IncidentStatusFilter)}
                  className="h-10 rounded-none border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-white/20"
                >
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </select>

                <select
                  value={incidentSort}
                  onChange={(e) => setIncidentSort(e.target.value as IncidentSort)}
                  className="h-10 rounded-none border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-white/20"
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
                  className="h-10 rounded-none border border-white/10 bg-white/5 px-4 text-sm font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="px-6 py-10 text-sm text-zinc-400">Loading incidents…</div>
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
        </main>
      </div>
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
    incident.urgency === "high" ? "bg-white/10 text-zinc-200" : "bg-white/5 text-zinc-300";

  const plannedClasses = incident.planned ? "bg-white/5 text-zinc-300" : "bg-white/10 text-zinc-200";

  const statusClasses =
    incident.status === "resolved" ? "bg-emerald-500/10 text-emerald-300" : "bg-white/10 text-zinc-200";

  return (
    <li className="px-6 py-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="text-base font-semibold">{incident.title}</div>
          {incident.summary ? <div className="text-sm text-zinc-400">{incident.summary}</div> : null}
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
