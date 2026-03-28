import { NextResponse } from "next/server";
import { getIncidentsLast24Hours, getState } from "@/lib/monitor-state";
import type { StatusResponse } from "@/lib/types";
import { incidentIoEnabled, listIncidentsLast24Hours } from "@/lib/incident-io";

export const dynamic = "force-dynamic";

export async function GET() {
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
