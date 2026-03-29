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
  betterstackEnabled,
  getMonitor,
  getMonitorMetadataValue,
  setMonitorMetadataValue,
  upsertMetadataIncidentLog,
} from "@/lib/betterstack";
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
  if (betterstackEnabled()) {
    const monitor = await getMonitor();
    const status =
      (monitor.status ?? "").toLowerCase() === "up"
        ? "operational"
        : (monitor.status ?? "").toLowerCase() === "down"
          ? "down"
          : "degraded";

    const lastNotifiedStatus = await getMonitorMetadataValue("status_page_last_notified_status");
    const lastDownAt = await getMonitorMetadataValue("status_page_last_down_at");

    const now = new Date();
    const nowIso = now.toISOString();

    if (!lastNotifiedStatus) {
      await setMonitorMetadataValue("status_page_last_notified_status", status);
      if (status === "down") {
        await setMonitorMetadataValue("status_page_last_down_at", nowIso);
      }
    } else if (lastNotifiedStatus !== status) {
      await setMonitorMetadataValue("status_page_last_state_change_at", nowIso);
      if (lastNotifiedStatus !== "down" && status === "down") {
        await setMonitorMetadataValue("status_page_last_down_at", nowIso);
        await sendDownEmail(monitor.url ?? getTargetUrl(), now);
      }

      if (lastNotifiedStatus === "down" && status !== "down") {
        const start = lastDownAt ? new Date(lastDownAt) : null;
        const downtimeDuration =
          start && Number.isFinite(start.getTime()) ? formatDuration(start, now) : "Unknown";

        await sendRecoveredEmail(monitor.url ?? getTargetUrl(), now, downtimeDuration);
        await setMonitorMetadataValue("status_page_last_down_at", null);
      }

      await setMonitorMetadataValue("status_page_last_notified_status", status);
    }

    setMonitoredUrl(monitor.url ?? getTargetUrl());
    forceStatus(status);

    return {
      ok: status !== "down",
      status,
      changed: lastNotifiedStatus != null && lastNotifiedStatus !== status,
      message: `Betterstack monitor status: ${monitor.status ?? "unknown"}`,
    };
  }

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
      title: "paveer.com outage",
      severity: "major",
      summary: "Automatic detection: repeated failed checks.",
    });
    setActiveLocalIncidentId(localIncidentId);

    if (betterstackEnabled()) {
      const incident = getState().incidents.find((i) => i.id === localIncidentId);
      if (incident) {
        await upsertMetadataIncidentLog(incident);
      }
    }

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

      if (betterstackEnabled()) {
        const updated = getState().incidents.find((i) => i.id === state.activeLocalIncidentId);
        if (updated) {
          await upsertMetadataIncidentLog(updated);
        }
      }

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
    title: "paveer.com outage (simulated)",
    severity: "major",
    summary: "Manual simulation triggered for testing.",
  });
  setActiveLocalIncidentId(localIncidentId);

  if (betterstackEnabled()) {
    const incident = getState().incidents.find((i) => i.id === localIncidentId);
    if (incident) {
      await upsertMetadataIncidentLog(incident);
    }
  }

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

    if (betterstackEnabled()) {
      const updated = getState().incidents.find((i) => i.id === state.activeLocalIncidentId);
      if (updated) {
        await upsertMetadataIncidentLog(updated);
      }
    }

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
