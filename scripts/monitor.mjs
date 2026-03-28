import nextEnv from "@next/env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { loadEnvConfig } = nextEnv;

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvConfig(projectDir);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const stateDir = path.join(projectDir, ".monitor");
const stateFile = path.join(stateDir, "state.json");

const FAILURES_TO_DOWN = 3;
const SUCCESSES_TO_RECOVER = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const DEGRADED_LATENCY_MS = 2_000;

async function readState() {
  try {
    const raw = await readFile(stateFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      forcedDown: false,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastKnownState: "unknown",
      activeIncidentId: null,
      lastCheckAt: null,
    };
  }
}

async function writeState(state) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function checkUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    return {
      ok: res.ok,
      status: res.status,
      latencyMs,
      error: null,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    return {
      ok: false,
      status: null,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function formatTimestamp(iso) {
  try {
    return new Date(iso).toISOString();
  } catch {
    return iso;
  }
}

function stateFromCheck({ ok, latencyMs }) {
  if (!ok) return "down";
  if (latencyMs >= DEGRADED_LATENCY_MS) return "degraded";
  return "operational";
}

async function betterstackRequest(pathname, { method, body } = {}) {
  const apiKey = requireEnv("BETTERSTACK_API_KEY");
  const url = `https://uptime.betterstack.com${pathname}`;

  const res = await fetch(url, {
    method: method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Betterstack ${method ?? "GET"} ${pathname} failed: ${res.status} ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function createIncident({ targetUrl, detectedAtIso, cause }) {
  const requesterEmail = process.env.EMAIL_FROM ?? process.env.EMAIL_TO ?? "monitor@example.com";
  const summary = `${targetUrl} is DOWN`;
  const description = `Automated check failed for ${targetUrl} at ${formatTimestamp(detectedAtIso)}.\nCause: ${cause}`;

  const body = {
    summary,
    requester_email: requesterEmail,
    description,
    metadata: {
      "Monitored URL": [{ value: targetUrl }],
      "Detected At": [{ value: formatTimestamp(detectedAtIso) }],
      Cause: [{ value: cause }],
    },
  };

  const json = await betterstackRequest("/api/v3/incidents", { method: "POST", body });
  const incidentId = json?.data?.id;
  if (!incidentId) throw new Error("Betterstack did not return incident id");
  return String(incidentId);
}

async function resolveIncident(incidentId) {
  const resolvedBy = process.env.EMAIL_FROM ?? process.env.EMAIL_TO ?? "monitor@example.com";
  await betterstackRequest(`/api/v3/incidents/${incidentId}/resolve`, {
    method: "POST",
    body: { resolved_by: resolvedBy },
  });
}

async function sendEmail({ status, targetUrl, incidentId, detectedAtIso }) {
  const provider = (process.env.EMAIL_PROVIDER ?? "").toLowerCase();
  if (provider !== "emailjs") return;

  const serviceId = requireEnv("EMAILJS_SERVICE_ID");
  const templateId = requireEnv("EMAILJS_TEMPLATE_ID");
  const publicKey = requireEnv("EMAILJS_PUBLIC_KEY");
  const privateKey = requireEnv("EMAILJS_PRIVATE_KEY");

  const subject =
    status === "down" ? "Paveer System Health: DOWN" : "Paveer System Health: RECOVERED";

  const template_params = {
    subject,
    status: status.toUpperCase(),
    monitored_url: targetUrl,
    timestamp: formatTimestamp(detectedAtIso),
    incident_id: incidentId ?? "",
    incident_url: incidentId
      ? `https://uptime.betterstack.com/incidents/${encodeURIComponent(incidentId)}`
      : "",
  };

  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EmailJS send failed: ${res.status} ${text}`);
  }
}

async function main() {
  const targetUrl = requireEnv("MONITOR_TARGET_URL");
  const detectedAtIso = new Date().toISOString();

  const state = await readState();

  const check = state.forcedDown
    ? { ok: false, status: null, latencyMs: 0, error: "forcedDown=true" }
    : await checkUrl(targetUrl);

  const nextFromSingleCheck = stateFromCheck(check);
  const isSuccess = check.ok;

  if (isSuccess) {
    state.consecutiveSuccesses = (state.consecutiveSuccesses ?? 0) + 1;
    state.consecutiveFailures = 0;
  } else {
    state.consecutiveFailures = (state.consecutiveFailures ?? 0) + 1;
    state.consecutiveSuccesses = 0;
  }

  const previousState = state.lastKnownState ?? "unknown";
  let newState = previousState;

  if (previousState === "down") {
    if (state.consecutiveSuccesses >= SUCCESSES_TO_RECOVER) {
      newState = "operational";
    } else {
      newState = "down";
    }
  } else {
    if (state.consecutiveFailures >= FAILURES_TO_DOWN) {
      newState = "down";
    } else {
      newState = nextFromSingleCheck;
    }
  }

  const cause = check.error
    ? check.error
    : check.status
      ? `HTTP ${check.status}`
      : "Unknown failure";

  const transitionedDown = previousState !== "down" && newState === "down";
  const transitionedUp = previousState === "down" && newState !== "down";

  if (transitionedDown) {
    const incidentId = await createIncident({ targetUrl, detectedAtIso, cause });
    state.activeIncidentId = incidentId;
    await sendEmail({ status: "down", targetUrl, incidentId, detectedAtIso });
  }

  if (transitionedUp) {
    const incidentId = state.activeIncidentId;
    if (incidentId) {
      await resolveIncident(incidentId);
    }
    await sendEmail({ status: "recovered", targetUrl, incidentId, detectedAtIso });
    state.activeIncidentId = null;
  }

  state.lastKnownState = newState;
  state.lastCheckAt = detectedAtIso;

  await writeState(state);

  process.stdout.write(
    JSON.stringify(
      {
        targetUrl,
        check: {
          ok: check.ok,
          status: check.status,
          latencyMs: check.latencyMs,
          error: check.error,
        },
        previousState,
        newState,
        consecutiveFailures: state.consecutiveFailures,
        consecutiveSuccesses: state.consecutiveSuccesses,
        activeIncidentId: state.activeIncidentId,
        at: detectedAtIso,
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exitCode = 1;
});
