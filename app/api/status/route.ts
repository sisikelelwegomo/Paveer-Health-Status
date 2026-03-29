import { NextResponse } from "next/server";
import { getIncidentsLast24Hours, getState } from "@/lib/monitor-state";
import type { Incident, StatusResponse, SystemStatus } from "@/lib/types";
import { incidentIoEnabled, listIncidentsLast24Hours } from "@/lib/incident-io";
import {
  betterstackEnabled,
  getMonitor,
  getMonitorMetadataValue,
  listIncidentsLast24Hours as listBetterstackIncidentsLast24Hours,
  listMetadataIncidentLog,
} from "@/lib/betterstack";

export const dynamic = "force-dynamic";

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

    const response: StatusResponse = {
      status,
      monitoredUrl: monitor.url ?? getState().monitoredUrl,
      lastCheckedAt: monitor.lastCheckedAt,
      lastStateChangeAt: lastStateChangeAt ?? null,
      downtimeStartedAt: status === "down" ? (lastDownAt ?? null) : null,
      lastLatencyMs: null,
      activeLocalIncidentId: null,
      activeIncidentIoId: null,
      incidents,
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
