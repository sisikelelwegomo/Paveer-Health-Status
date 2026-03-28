import type { Incident, IncidentSeverity } from "@/lib/types";

type IncidentIoSeverity = {
  id: string;
  name: string;
};

type IncidentIoIncident = {
  id: string;
  name: string;
  summary?: string | null;
  status?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  severity?: { id: string; name: string } | null;
};

let severityCache: IncidentIoSeverity[] | null = null;

function getApiKey(): string | null {
  const key = process.env.INCIDENT_IO_API_KEY;
  return key && key.trim().length > 0 ? key : null;
}

export function incidentIoEnabled(): boolean {
  return getApiKey() !== null;
}

function apiUrl(path: string): string {
  return `https://api.incident.io${path}`;
}

async function incidentIoFetch(path: string, init?: RequestInit): Promise<Response> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Missing INCIDENT_IO_API_KEY");
  }

  return fetch(apiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function getSeverities(): Promise<IncidentIoSeverity[]> {
  if (severityCache) return severityCache;

  const res = await incidentIoFetch("/v1/severities", { method: "GET" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`incident.io list severities failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { severities?: Array<{ id: string; name: string }> };
  const severities = (json.severities ?? []).map((s) => ({ id: s.id, name: s.name }));
  severityCache = severities;
  return severities;
}

function normalizeSeverity(severity: IncidentSeverity): string[] {
  if (severity === "critical") return ["critical", "sev0", "sev 0", "sev1", "sev 1"];
  if (severity === "major") return ["major", "sev2", "sev 2", "high"];
  return ["minor", "sev3", "sev 3", "low"];
}

async function resolveSeverityId(severity: IncidentSeverity): Promise<string> {
  const envKey =
    severity === "critical"
      ? process.env.INCIDENT_IO_SEVERITY_ID_CRITICAL
      : severity === "major"
        ? process.env.INCIDENT_IO_SEVERITY_ID_MAJOR
        : process.env.INCIDENT_IO_SEVERITY_ID_MINOR;

  if (envKey && envKey.trim().length > 0) return envKey.trim();

  const severities = await getSeverities();
  const candidates = normalizeSeverity(severity);

  const match = severities.find((s) =>
    candidates.some((c) => s.name.toLowerCase().includes(c)),
  );

  if (!match) {
    throw new Error(`No matching incident.io severity found for: ${severity}`);
  }

  return match.id;
}

export async function createIncidentIoIncident(args: {
  title: string;
  summary: string;
  severity: IncidentSeverity;
  idempotencyKey: string;
}): Promise<string> {
  const severityId = await resolveSeverityId(args.severity);

  const res = await incidentIoFetch("/v2/incidents", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: args.idempotencyKey,
      name: args.title,
      summary: args.summary,
      severity_id: severityId,
      visibility: "public",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`incident.io create incident failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { incident?: { id: string } };
  const id = json.incident?.id;
  if (!id) throw new Error("incident.io create incident: missing incident id");
  return id;
}

export async function editIncidentIoIncident(args: {
  incidentId: string;
  summary?: string;
  status?: "resolved";
}): Promise<void> {
  const incident: Record<string, unknown> = {};
  if (args.summary) incident.summary = args.summary;
  if (args.status) incident.status = args.status;

  const res = await incidentIoFetch(`/v2/incidents/${args.incidentId}/actions/edit`, {
    method: "POST",
    body: JSON.stringify({
      incident,
      notify_incident_channel: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`incident.io edit incident failed: ${res.status} ${text}`);
  }
}

function mapIncidentIoSeverity(severityName?: string | null): IncidentSeverity {
  const name = (severityName ?? "").toLowerCase();
  if (name.includes("critical") || name.includes("sev0") || name.includes("sev 0")) return "critical";
  if (name.includes("major") || name.includes("sev1") || name.includes("sev 1") || name.includes("sev2") || name.includes("sev 2")) {
    return "major";
  }
  if (name.includes("minor") || name.includes("sev3") || name.includes("sev 3")) return "minor";
  return "major";
}

function mapIncidentIoStatus(status?: string | null): "open" | "resolved" {
  const s = (status ?? "").toLowerCase();
  if (s.includes("resolved") || s === "closed") return "resolved";
  return "open";
}

export async function listIncidentsLast24Hours(): Promise<Incident[]> {
  const now = new Date();
  const from = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const fromDate = from.toISOString().slice(0, 10);
  const toDate = now.toISOString().slice(0, 10);

  const res = await incidentIoFetch(
    `/v2/incidents?created_at[date_range]=${encodeURIComponent(`${fromDate}~${toDate}`)}`,
    { method: "GET" },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`incident.io list incidents failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { incidents?: IncidentIoIncident[] };
  const incidents = (json.incidents ?? [])
    .map((inc): Incident | null => {
      if (!inc.id || !inc.name || !inc.created_at) return null;

      return {
        id: inc.id,
        title: inc.name,
        summary: inc.summary ?? undefined,
        severity: mapIncidentIoSeverity(inc.severity?.name),
        category: "engineering",
        urgency: "high",
        planned: false,
        status: mapIncidentIoStatus(inc.status),
        createdAt: inc.created_at,
        resolvedAt: inc.resolved_at ?? undefined,
      };
    })
    .filter((x): x is Incident => x !== null);

  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  return incidents
    .filter((i) => new Date(i.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

