import {
  addIncident,
  clearDowntimeStartedAt,
  forceStatus,
  getState,
  recordFailure,
  recordSuccess,
  resolveIncident,
  setActiveIncidentIoId,
  setActiveLocalIncidentId,
  setMonitoredUrl,
} from "@/lib/monitor-state";
import type { SystemStatus } from "@/lib/types";
import { formatDuration, sendDownEmail, sendRecoveredEmail } from "@/lib/emailjs";
import {
  createIncidentIoIncident,
  editIncidentIoIncident,
  incidentIoEnabled,
} from "@/lib/incident-io";

type MonitorRunResult = {
  ok: boolean;
  status: SystemStatus;
  changed: boolean;
  message: string;
};

function getTargetUrl(): string {
  return process.env.MONITOR_TARGET_URL ?? "https://paveer.com";
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "paveer-system-health/1.0",
        accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function runMonitorOnce(): Promise<MonitorRunResult> {
  const targetUrl = getTargetUrl();
  setMonitoredUrl(targetUrl);

  const start = Date.now();

  try {
    const res = await fetchWithTimeout(targetUrl, 10_000);
    const latencyMs = Date.now() - start;

    const ok = res.ok;
    const transition = ok ? recordSuccess(latencyMs) : recordFailure();

    await handleTransitions(transition.previousStatus, transition.nextStatus, targetUrl);

    return {
      ok,
      status: transition.nextStatus,
      changed: transition.changed,
      message: ok ? "Check succeeded" : `Check failed with status ${res.status}`,
    };
  } catch {
    const transition = recordFailure();
    await handleTransitions(transition.previousStatus, transition.nextStatus, targetUrl);

    return {
      ok: false,
      status: transition.nextStatus,
      changed: transition.changed,
      message: "Check failed (timeout or network error)",
    };
  }
}

async function handleTransitions(
  previousStatus: SystemStatus,
  nextStatus: SystemStatus,
  monitoredUrl: string,
): Promise<void> {
  if (previousStatus === nextStatus) return;

  const state = getState();

  if (previousStatus !== "down" && nextStatus === "down") {
    const localIncidentId = addIncident({
      title: "Paveer.com outage",
      severity: "major",
      summary: "Automatic detection: repeated failed checks.",
    });
    setActiveLocalIncidentId(localIncidentId);

    if (incidentIoEnabled()) {
      const incidentIoId = await createIncidentIoIncident({
        title: `Paveer System Health: ${new URL(monitoredUrl).hostname} DOWN`,
        summary: `Automatic detection: repeated failed checks for ${monitoredUrl}.`,
        severity: "major",
        idempotencyKey: `${monitoredUrl}::${new Date().toISOString()}`,
      });
      setActiveIncidentIoId(incidentIoId);
    }

    await sendDownEmail(monitoredUrl, new Date());
    return;
  }

  if (previousStatus === "down" && nextStatus !== "down") {
    const now = new Date();
    const start =
      state.downtimeStartedAt != null
        ? new Date(state.downtimeStartedAt)
        : state.activeLocalIncidentId
          ? new Date(
              state.incidents.find((i) => i.id === state.activeLocalIncidentId)?.createdAt ??
                now.toISOString(),
            )
          : null;
    const downtimeDuration = start ? formatDuration(start, now) : "Unknown";

    if (state.activeLocalIncidentId) {
      resolveIncident(state.activeLocalIncidentId, {
        resolution: "Automatic recovery detected: checks succeeded again.",
      });
      setActiveLocalIncidentId(null);
    }

    if (state.activeIncidentIoId && incidentIoEnabled()) {
      await editIncidentIoIncident({
        incidentId: state.activeIncidentIoId,
        status: "resolved",
        summary: `Resolved. Downtime: ${downtimeDuration}. Monitored URL: ${monitoredUrl}.`,
      });
      setActiveIncidentIoId(null);
    }

    await sendRecoveredEmail(monitoredUrl, now, downtimeDuration);
    clearDowntimeStartedAt();
  }
}

export async function simulateDown(): Promise<void> {
  const monitoredUrl = getTargetUrl();
  setMonitoredUrl(monitoredUrl);
  forceStatus("down");

  const localIncidentId = addIncident({
    title: "Paveer.com outage (simulated)",
    severity: "major",
    summary: "Manual simulation triggered for testing.",
  });
  setActiveLocalIncidentId(localIncidentId);

  if (incidentIoEnabled()) {
    const incidentIoId = await createIncidentIoIncident({
      title: `Paveer System Health: ${new URL(monitoredUrl).hostname} DOWN (simulated)`,
      summary: `Manual simulation triggered for ${monitoredUrl}.`,
      severity: "major",
      idempotencyKey: `simulated::${monitoredUrl}::${new Date().toISOString()}`,
    });
    setActiveIncidentIoId(incidentIoId);
  }

  await sendDownEmail(monitoredUrl, new Date());
}

export async function simulateRecover(): Promise<void> {
  const monitoredUrl = getTargetUrl();
  setMonitoredUrl(monitoredUrl);

  const state = getState();
  const now = new Date();
  const start =
    state.downtimeStartedAt != null
      ? new Date(state.downtimeStartedAt)
      : state.activeLocalIncidentId
        ? new Date(
            state.incidents.find((i) => i.id === state.activeLocalIncidentId)?.createdAt ??
              now.toISOString(),
          )
        : null;
  const downtimeDuration = start ? formatDuration(start, now) : "Unknown";

  if (state.activeLocalIncidentId) {
    resolveIncident(state.activeLocalIncidentId, {
      resolution: "Manual simulation: recovery triggered.",
    });
    setActiveLocalIncidentId(null);
  }

  forceStatus("operational");

  if (state.activeIncidentIoId && incidentIoEnabled()) {
    await editIncidentIoIncident({
      incidentId: state.activeIncidentIoId,
      status: "resolved",
      summary: `Resolved (simulated). Downtime: ${downtimeDuration}. Monitored URL: ${monitoredUrl}.`,
    });
    setActiveIncidentIoId(null);
  }

  await sendRecoveredEmail(monitoredUrl, now, downtimeDuration);
  clearDowntimeStartedAt();
}
