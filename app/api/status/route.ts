import { NextResponse } from "next/server";
import { getIncidentsLast24Hours, getState } from "@/lib/monitor-state";
import type { Incident, StatusResponse, SystemStatus } from "@/lib/types";
import { incidentIoEnabled, listIncidentsLast24Hours } from "@/lib/incident-io";
import {
  betterstackEnabled,
  getMonitor,
  getMonitorMetadataValue,
  listIncidentsLast24Hours as listBetterstackIncidentsLast24Hours,
  listMetadataCheckLog,
  listMetadataIncidentLog,
} from "@/lib/betterstack";

export const dynamic = "force-dynamic";

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const clamped = Math.min(1, Math.max(0, p));
  const idx = Math.ceil(clamped * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] ?? null;
}

function computeUptime24hPercent(incidents: Incident[]): number | null {
  const now = Date.now();
  const windowStart = now - 24 * 60 * 60 * 1000;

  const intervals = incidents
    .map((i) => {
      const start = new Date(i.createdAt).getTime();
      const end = i.resolvedAt ? new Date(i.resolvedAt).getTime() : now;
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      const clampedStart = Math.max(start, windowStart);
      const clampedEnd = Math.min(end, now);
      if (clampedEnd <= clampedStart) return null;
      return { start: clampedStart, end: clampedEnd };
    })
    .filter((x): x is { start: number; end: number } => x !== null)
    .sort((a, b) => a.start - b.start);

  if (intervals.length === 0) return 100;

  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end) {
      merged.push(interval);
    } else {
      last.end = Math.max(last.end, interval.end);
    }
  }

  const downtimeMs = merged.reduce((sum, i) => sum + (i.end - i.start), 0);
  const totalMs = 24 * 60 * 60 * 1000;
  const uptime = Math.max(0, Math.min(1, 1 - downtimeMs / totalMs));
  return Math.round(uptime * 10000) / 100;
}

function mapBetterstackStatus(status: string | null): SystemStatus {
  const s = (status ?? "").toLowerCase();
  if (s === "up") return "operational";
  if (s === "down") return "down";
  return "degraded";
}

function mapBetterstackIncidentToIncident(inc: {
  id: string;
  name: string | null;
  cause: string | null;
  startedAt: string | null;
  resolvedAt: string | null;
}): Incident | null {
  if (!inc.startedAt) return null;
  return {
    id: inc.id,
    title: inc.name ?? "Incident",
    summary: inc.cause ?? undefined,
    severity: "major",
    category: "engineering",
    urgency: "high",
    planned: false,
    status: inc.resolvedAt ? "resolved" : "open",
    createdAt: inc.startedAt,
    resolvedAt: inc.resolvedAt ?? undefined,
    cause: inc.cause ?? undefined,
  };
}

export async function GET() {
  if (betterstackEnabled()) {
    const monitor = await getMonitor();
    const status = mapBetterstackStatus(monitor.status);
    const lastStateChangeAt = await getMonitorMetadataValue("status_page_last_state_change_at");
    const lastDownAt = await getMonitorMetadataValue("status_page_last_down_at");

    const betterstackIncidents = (await listBetterstackIncidentsLast24Hours())
      .map(mapBetterstackIncidentToIncident)
      .filter((x): x is Incident => x !== null);

    const metadataIncidents = await listMetadataIncidentLog();

    const incidents = (() => {
      const seen = new Set<string>();
      const merged: Incident[] = [];
      for (const inc of [...betterstackIncidents, ...metadataIncidents]) {
        if (seen.has(inc.id)) continue;
        seen.add(inc.id);
        merged.push(inc);
      }
      return merged;
    })();

    const checkLog = await listMetadataCheckLog();
    const recentChecks = checkLog.slice(0, 90);
    const lastLatencyMs = recentChecks[0]?.latencyMs ?? null;
    const latencyValues = recentChecks
      .map((c) => c.latencyMs)
      .filter((v): v is number => v != null && Number.isFinite(v))
      .sort((a, b) => a - b);

    const p50LatencyMs = percentile(latencyValues, 0.5);
    const p95LatencyMs = percentile(latencyValues, 0.95);
    const uptime24hPercent = computeUptime24hPercent(incidents);

    const response: StatusResponse = {
      status,
      monitoredUrl: monitor.url ?? getState().monitoredUrl,
      lastCheckedAt: monitor.lastCheckedAt,
      lastStateChangeAt: lastStateChangeAt ?? null,
      downtimeStartedAt: status === "down" ? (lastDownAt ?? null) : null,
      lastLatencyMs,
      activeLocalIncidentId: null,
      activeIncidentIoId: null,
      incidents,
      recentChecks,
      stats: {
        uptime24hPercent,
        p50LatencyMs,
        p95LatencyMs,
        checkCount: recentChecks.length,
        windowHours: 24,
      },
    };

    return NextResponse.json(response);
  }

  const state = getState();
  const incidents = incidentIoEnabled()
    ? await listIncidentsLast24Hours()
    : getIncidentsLast24Hours();

  const response: StatusResponse = {
    status: state.currentStatus,
    monitoredUrl: state.monitoredUrl,
    lastCheckedAt: state.lastCheckedAt,
    lastStateChangeAt: state.lastStateChangeAt,
    downtimeStartedAt: state.downtimeStartedAt,
    lastLatencyMs: state.lastLatencyMs,
    activeLocalIncidentId: state.activeLocalIncidentId,
    activeIncidentIoId: state.activeIncidentIoId,
    incidents,
  };

  return NextResponse.json(response);
}
