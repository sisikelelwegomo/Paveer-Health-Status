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
  listMetadataHourlyUptime,
  listMetadataIncidentLog,
} from "@/lib/betterstack";

export const dynamic = "force-dynamic";

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const clamped = Math.min(1, Math.max(0, p));
  const idx = Math.ceil(clamped * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] ?? null;
}

function computeUptimePercentFromBuckets(buckets: Array<{ total: number; down: number }>): number | null {
  const total = buckets.reduce((sum, d) => sum + (Number.isFinite(d.total) ? d.total : 0), 0);
  if (total <= 0) return null;
  const down = buckets.reduce((sum, d) => sum + (Number.isFinite(d.down) ? d.down : 0), 0);
  const up = Math.max(0, total - down);
  return Math.round((up / total) * 10000) / 100;
}

function computeUptimePercentFromChecks(
  checks: Array<{ status: SystemStatus }>,
): number | null {
  if (checks.length === 0) return null;
  const up = checks.reduce((sum, c) => sum + (c.status === "down" ? 0 : 1), 0);
  return Math.round((up / checks.length) * 10000) / 100;
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
    const lastCheckedAt = monitor.lastCheckedAt ?? checkLog[0]?.at ?? null;
    const lastLatencyMs = checkLog[0]?.latencyMs ?? null;
    const latencyValues = checkLog
      .slice(0, 300)
      .map((c) => c.latencyMs)
      .filter((v): v is number => v != null && Number.isFinite(v))
      .sort((a, b) => a - b);

    const p50LatencyMs = percentile(latencyValues, 0.5);
    const p95LatencyMs = percentile(latencyValues, 0.95);

    const hourly = await listMetadataHourlyUptime();
    const now = new Date();
    const currentHour = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        0,
        0,
        0,
      ),
    );

    const hours: string[] = [];
    for (let i = 23; i >= 0; i -= 1) {
      const d = new Date(currentHour.getTime() - i * 60 * 60 * 1000);
      hours.push(d.toISOString().slice(0, 13) + ":00:00.000Z");
    }

    const hourlyUptime = hours.map((hour) => {
      const entry = hourly.find((e) => e.hour === hour) ?? null;
      const total = entry?.total ?? 0;
      const down = entry?.down ?? 0;
      const degraded = entry?.degraded ?? 0;

      const uptimePercent = total > 0 ? Math.round(((total - down) / total) * 10000) / 100 : null;
      const status: SystemStatus =
        down > 0 ? "down" : degraded > 0 ? "degraded" : total > 0 ? "operational" : "operational";

      return { hour, status, uptimePercent, totalChecks: total };
    });

    const recentChecks = hours
      .map((hour) => {
        const entry = hourly.find((e) => e.hour === hour) ?? null;
        const total = entry?.total ?? 0;
        if (total <= 0) return null;

        const down = entry?.down ?? 0;
        const degraded = entry?.degraded ?? 0;
        const latencyMs =
          entry?.latencyCount && entry.latencyCount > 0
            ? entry.latencySumMs / entry.latencyCount
            : null;

        const bucketStatus: SystemStatus =
          down > 0 ? "down" : degraded > 0 ? "degraded" : "operational";

        return {
          at: hour,
          status: bucketStatus,
          latencyMs: latencyMs != null && Number.isFinite(latencyMs) ? latencyMs : null,
        };
      })
      .filter((x): x is { at: string; status: SystemStatus; latencyMs: number | null } => x !== null);

    const uptime24hPercent = computeUptimePercentFromBuckets(
      hours.map((hour) => {
        const entry = hourly.find((e) => e.hour === hour) ?? null;
        return { total: entry?.total ?? 0, down: entry?.down ?? 0 };
      }),
    );
    const uptime24hPercentFallback =
      uptime24hPercent ?? computeUptimePercentFromChecks(recentChecks.map((c) => ({ status: c.status })));

    const response: StatusResponse = {
      status,
      monitoredUrl: monitor.url ?? getState().monitoredUrl,
      lastCheckedAt,
      lastStateChangeAt: lastStateChangeAt ?? null,
      downtimeStartedAt: status === "down" ? (lastDownAt ?? null) : null,
      lastLatencyMs,
      activeLocalIncidentId: null,
      activeIncidentIoId: null,
      incidents,
      recentChecks,
      hourlyUptime,
      stats: {
        uptime24hPercent: uptime24hPercentFallback,
        p50LatencyMs,
        p95LatencyMs,
        checkCount: hours.reduce((sum, hour) => {
          const entry = hourly.find((e) => e.hour === hour) ?? null;
          return sum + (entry?.total ?? 0);
        }, 0),
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
