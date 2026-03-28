import type { Incident, MonitorState, SystemStatus } from "@/lib/types";

export const FAILURES_TO_DOWN = 3;
export const SUCCESSES_TO_RECOVER = 2;

const state: MonitorState = {
  currentStatus: "operational",
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  lastCheckedAt: null,
  lastStateChangeAt: null,
  downtimeStartedAt: null,
  incidents: [],
  activeLocalIncidentId: null,
  activeIncidentIoId: null,
  monitoredUrl: process.env.MONITOR_TARGET_URL ?? "https://paveer.com",
  lastLatencyMs: null,
};

export function getState(): MonitorState {
  return {
    ...state,
    incidents: [...state.incidents],
  };
}

export function setMonitoredUrl(url: string): void {
  state.monitoredUrl = url;
}

export function addIncident(
  incident: {
    title: string;
    severity: Incident["severity"];
    summary?: string;
    cause?: string;
    resolution?: string;
    category?: Incident["category"];
    urgency?: Incident["urgency"];
    planned?: Incident["planned"];
    id?: string;
    createdAt?: string;
    resolvedAt?: string;
    status?: "open" | "resolved";
  },
): string {
  const id =
    incident.id ?? (typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}`);

  const createdAt = incident.createdAt ?? new Date().toISOString();

  state.incidents.unshift({
    id,
    title: incident.title,
    summary: incident.summary,
    severity: incident.severity,
    category: incident.category ?? "engineering",
    urgency: incident.urgency ?? "high",
    planned: incident.planned ?? false,
    status: incident.status ?? "open",
    createdAt,
    resolvedAt: incident.resolvedAt,
    cause: incident.cause,
    resolution: incident.resolution,
  });

  if (state.incidents.length > 50) {
    state.incidents = state.incidents.slice(0, 50);
  }

  return id;
}

export function resolveIncident(
  incidentId: string,
  resolution?: { resolution?: string; cause?: string },
): void {
  const incident = state.incidents.find((i) => i.id === incidentId);
  if (!incident) return;

  incident.status = "resolved";
  incident.resolvedAt = new Date().toISOString();
  incident.resolution = resolution?.resolution ?? incident.resolution;
  incident.cause = resolution?.cause ?? incident.cause;
}

export function getIncidentsLast24Hours(now: Date = new Date()): Incident[] {
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  return state.incidents.filter((incident) => {
    const t = new Date(incident.createdAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

function setStatus(status: SystemStatus): void {
  const previousStatus = state.currentStatus;

  if (previousStatus !== status) {
    state.currentStatus = status;
    const now = new Date().toISOString();
    state.lastStateChangeAt = now;

    if (previousStatus !== "down" && status === "down") {
      state.downtimeStartedAt = now;
    }
  }
}

export function recordSuccess(latencyMs: number | null): {
  changed: boolean;
  previousStatus: SystemStatus;
  nextStatus: SystemStatus;
} {
  const previousStatus = state.currentStatus;
  state.consecutiveSuccesses += 1;
  state.consecutiveFailures = 0;
  state.lastCheckedAt = new Date().toISOString();
  state.lastLatencyMs = latencyMs;

  if (state.currentStatus === "down") {
    if (state.consecutiveSuccesses >= SUCCESSES_TO_RECOVER) {
      setStatus("operational");
    }
  } else if (state.currentStatus === "degraded") {
    if (state.consecutiveSuccesses >= SUCCESSES_TO_RECOVER) {
      setStatus("operational");
    }
  }

  return {
    changed: previousStatus !== state.currentStatus,
    previousStatus,
    nextStatus: state.currentStatus,
  };
}

export function recordFailure(): {
  changed: boolean;
  previousStatus: SystemStatus;
  nextStatus: SystemStatus;
} {
  const previousStatus = state.currentStatus;
  state.consecutiveFailures += 1;
  state.consecutiveSuccesses = 0;
  state.lastCheckedAt = new Date().toISOString();
  state.lastLatencyMs = null;

  if (state.currentStatus === "operational" && state.consecutiveFailures === 1) {
    setStatus("degraded");
  }

  if (state.consecutiveFailures >= FAILURES_TO_DOWN) {
    setStatus("down");
  }

  return {
    changed: previousStatus !== state.currentStatus,
    previousStatus,
    nextStatus: state.currentStatus,
  };
}

export function forceStatus(status: SystemStatus): void {
  setStatus(status);
  state.lastCheckedAt = new Date().toISOString();

  if (status === "down") {
    state.consecutiveFailures = FAILURES_TO_DOWN;
    state.consecutiveSuccesses = 0;
  } else {
    state.consecutiveFailures = 0;
    state.consecutiveSuccesses = SUCCESSES_TO_RECOVER;
  }
}

export function setActiveLocalIncidentId(id: string | null): void {
  state.activeLocalIncidentId = id;
}

export function setActiveIncidentIoId(id: string | null): void {
  state.activeIncidentIoId = id;
}

export function clearDowntimeStartedAt(): void {
  state.downtimeStartedAt = null;
}
