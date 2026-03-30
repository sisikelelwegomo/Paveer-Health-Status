import type { Incident, SystemStatus } from "@/lib/types";

type BetterstackMonitor = {
  id: string;
  url: string | null;
  name: string | null;
  status: string | null;
  lastCheckedAt: string | null;
};

type BetterstackIncident = {
  id: string;
  name: string | null;
  url: string | null;
  cause: string | null;
  startedAt: string | null;
  resolvedAt: string | null;
  status: string | null;
  monitorId: string | null;
};

type BetterstackMetadataRecord = {
  id: string;
  key: string;
  values: Array<{ type?: string; value?: string | null }>;
};

function getBetterstackApiKey(): string | null {
  const key = process.env.BETTERSTACK_API_KEY;
  return key && key.trim().length > 0 ? key : null;
}

export function betterstackEnabled(): boolean {
  return getBetterstackApiKey() !== null && !!process.env.BETTERSTACK_MONITOR_ID;
}

function requireBetterstackConfig(): { apiKey: string; monitorId: string } {
  const apiKey = getBetterstackApiKey();
  if (!apiKey) throw new Error("Missing BETTERSTACK_API_KEY");
  const monitorId = process.env.BETTERSTACK_MONITOR_ID ?? "";
  if (!monitorId.trim()) throw new Error("Missing BETTERSTACK_MONITOR_ID");
  return { apiKey, monitorId: monitorId.trim() };
}

async function betterstackFetch(pathname: string, init?: RequestInit): Promise<Response> {
  const { apiKey } = requireBetterstackConfig();

  return fetch(`https://uptime.betterstack.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Betterstack request failed: ${res.status} ${text}`);
  }
  return JSON.parse(text) as T;
}

export async function getMonitor(): Promise<BetterstackMonitor> {
  const { monitorId } = requireBetterstackConfig();
  const res = await betterstackFetch(`/api/v2/monitors/${encodeURIComponent(monitorId)}`, {
    method: "GET",
  });

  const json = await parseJson<{
    data?: { id?: string; attributes?: { url?: string; pronounceable_name?: string; status?: string; last_checked_at?: string } };
  }>(res);

  const id = String(json.data?.id ?? monitorId);
  const attrs = json.data?.attributes;

  return {
    id,
    url: attrs?.url ?? null,
    name: attrs?.pronounceable_name ?? null,
    status: attrs?.status ?? null,
    lastCheckedAt: attrs?.last_checked_at ?? null,
  };
}

export async function listIncidentsLast24Hours(): Promise<BetterstackIncident[]> {
  const { monitorId } = requireBetterstackConfig();
  const targetUrl = process.env.MONITOR_TARGET_URL ?? "";
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const fromDate = from.toISOString().slice(0, 10);
  const toDate = now.toISOString().slice(0, 10);

  const url = new URL("https://uptime.betterstack.com/api/v3/incidents");
  url.searchParams.set("from", fromDate);
  url.searchParams.set("to", toDate);
  url.searchParams.set("per_page", "50");
  url.searchParams.set("page", "1");

  const res = await betterstackFetch(`/api/v3/incidents${url.search}`, { method: "GET" });

  const json = await parseJson<{
    data?: Array<{
      id?: string;
      attributes?: {
        name?: string;
        url?: string | null;
        cause?: string;
        started_at?: string;
        resolved_at?: string;
        status?: string;
      };
      relationships?: { monitor?: { data?: { id?: string } } };
    }>;
  }>(res);

  const items = json.data ?? [];
  return items
    .map((inc): BetterstackIncident | null => {
      const id = inc.id ? String(inc.id) : null;
      if (!id) return null;
      const attrs = inc.attributes;
      const relMonitorId = inc.relationships?.monitor?.data?.id ?? null;
      return {
        id,
        name: attrs?.name ?? null,
        url: attrs?.url ?? null,
        cause: attrs?.cause ?? null,
        startedAt: attrs?.started_at ?? null,
        resolvedAt: attrs?.resolved_at ?? null,
        status: attrs?.status ?? null,
        monitorId: relMonitorId ? String(relMonitorId) : null,
      };
    })
    .filter((x): x is BetterstackIncident => x !== null)
    .filter((x) => x.monitorId === monitorId || (!!targetUrl && x.url === targetUrl));
}

export async function listMonitorMetadata(): Promise<BetterstackMetadataRecord[]> {
  const { monitorId } = requireBetterstackConfig();

  const url = new URL("https://uptime.betterstack.com/api/v3/metadata");
  url.searchParams.set("owner_id", monitorId);
  url.searchParams.set("owner_type", "Monitor");
  url.searchParams.set("per_page", "50");
  url.searchParams.set("page", "1");

  const res = await betterstackFetch(`/api/v3/metadata${url.search}`, { method: "GET" });

  const json = await parseJson<{
    data?: Array<{
      id?: string;
      attributes?: { key?: string; values?: Array<{ type?: string; value?: string | null }> };
    }>;
  }>(res);

  return (json.data ?? [])
    .map((m): BetterstackMetadataRecord | null => {
      const id = m.id ? String(m.id) : null;
      const key = m.attributes?.key ? String(m.attributes.key) : null;
      if (!id || !key) return null;
      return { id, key, values: m.attributes?.values ?? [] };
    })
    .filter((x): x is BetterstackMetadataRecord => x !== null);
}

export async function getMonitorMetadataValue(key: string): Promise<string | null> {
  const values = await getMonitorMetadataValues(key);
  const value = values[0] ?? null;
  return value && value.trim().length > 0 ? value : null;
}

export async function getMonitorMetadataValues(key: string): Promise<string[]> {
  const { monitorId } = requireBetterstackConfig();
  const perPage = 50;

  for (let page = 1; page <= 10; page += 1) {
    const url = new URL("https://uptime.betterstack.com/api/v3/metadata");
    url.searchParams.set("owner_id", monitorId);
    url.searchParams.set("owner_type", "Monitor");
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));

    const res = await betterstackFetch(`/api/v3/metadata${url.search}`, { method: "GET" });
    const json = await parseJson<{
      data?: Array<{
        id?: string;
        attributes?: { key?: string; values?: Array<{ type?: string; value?: string | null }> };
      }>;
    }>(res);

    const records = (json.data ?? [])
      .map((m): BetterstackMetadataRecord | null => {
        const id = m.id ? String(m.id) : null;
        const k = m.attributes?.key ? String(m.attributes.key) : null;
        if (!id || !k) return null;
        return { id, key: k, values: m.attributes?.values ?? [] };
      })
      .filter((x): x is BetterstackMetadataRecord => x !== null);

    const record = records.find((r) => r.key === key);
    if (record) {
      return (record.values ?? [])
        .map((v) => v.value ?? null)
        .filter((v): v is string => !!v && v.trim().length > 0);
    }

    if (records.length < perPage) break;
  }

  return [];
}

export async function setMonitorMetadataValue(key: string, value: string | null): Promise<void> {
  await setMonitorMetadataValues(key, value == null ? [] : [value]);
}

export async function setMonitorMetadataValues(key: string, values: string[]): Promise<void> {
  const { monitorId } = requireBetterstackConfig();
  const body = {
    key,
    owner_id: monitorId,
    owner_type: "Monitor",
    values: values.map((value) => ({ value })),
  };

  const res = await betterstackFetch("/api/v3/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  await parseJson(res);
}

const INCIDENT_LOG_KEY = "status_page_incident_log";

export async function listMetadataIncidentLog(): Promise<Incident[]> {
  const values = await getMonitorMetadataValues(INCIDENT_LOG_KEY);
  return values
    .map((raw): Incident | null => {
      try {
        const parsed = JSON.parse(raw) as Incident;
        if (!parsed?.id || !parsed?.title || !parsed?.createdAt) return null;
        return parsed;
      } catch {
        return null;
      }
    })
    .filter((x): x is Incident => x !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function upsertMetadataIncidentLog(incident: Incident): Promise<void> {
  const existing = await listMetadataIncidentLog();
  const next = [incident, ...existing.filter((i) => i.id !== incident.id)]
    .slice(0, 50)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  await setMonitorMetadataValues(
    INCIDENT_LOG_KEY,
    next.map((i) => JSON.stringify(i)),
  );
}

type CheckLogEntry = {
  at: string;
  status: SystemStatus;
  latencyMs: number | null;
};

const CHECK_LOG_KEY = "status_page_check_log";

export async function listMetadataCheckLog(): Promise<CheckLogEntry[]> {
  const values = await getMonitorMetadataValues(CHECK_LOG_KEY);
  return values
    .map((raw): CheckLogEntry | null => {
      try {
        const parsed = JSON.parse(raw) as CheckLogEntry;
        if (!parsed?.at || !parsed?.status) return null;
        return {
          at: String(parsed.at),
          status: parsed.status,
          latencyMs:
            parsed.latencyMs == null || Number.isNaN(Number(parsed.latencyMs))
              ? null
              : Number(parsed.latencyMs),
        };
      } catch {
        return null;
      }
    })
    .filter((x): x is CheckLogEntry => x !== null)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export async function appendMetadataCheckLogEntry(entry: CheckLogEntry): Promise<void> {
  const existing = await listMetadataCheckLog();
  const next = [entry, ...existing]
    .slice(0, 300)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  await setMonitorMetadataValues(
    CHECK_LOG_KEY,
    next.map((i) => JSON.stringify(i)),
  );
}

type HourlyUptimeEntry = {
  hour: string;
  total: number;
  operational: number;
  degraded: number;
  down: number;
  latencySumMs: number;
  latencyCount: number;
};

const HOURLY_UPTIME_KEY = "status_page_hourly_uptime";

export async function listMetadataHourlyUptime(): Promise<HourlyUptimeEntry[]> {
  const values = await getMonitorMetadataValues(HOURLY_UPTIME_KEY);
  return values
    .map((raw): HourlyUptimeEntry | null => {
      try {
        const parsed = JSON.parse(raw) as HourlyUptimeEntry;
        if (!parsed?.hour) return null;
        return {
          hour: String(parsed.hour),
          total: Number(parsed.total ?? 0),
          operational: Number(parsed.operational ?? 0),
          degraded: Number(parsed.degraded ?? 0),
          down: Number(parsed.down ?? 0),
          latencySumMs: Number(parsed.latencySumMs ?? 0),
          latencyCount: Number(parsed.latencyCount ?? 0),
        };
      } catch {
        return null;
      }
    })
    .filter((x): x is HourlyUptimeEntry => x !== null)
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

export async function recordMetadataHourlyCheck(entry: CheckLogEntry): Promise<void> {
  const date = new Date(entry.at);
  if (Number.isNaN(date.getTime())) return;
  const normalized = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      0,
      0,
      0,
    ),
  );
  const hour = normalized.toISOString().slice(0, 13) + ":00:00.000Z";

  const existing = await listMetadataHourlyUptime();
  const idx = existing.findIndex((e) => e.hour === hour);

  const next = [...existing];
  const current: HourlyUptimeEntry =
    idx === -1
      ? {
          hour,
          total: 0,
          operational: 0,
          degraded: 0,
          down: 0,
          latencySumMs: 0,
          latencyCount: 0,
        }
      : next[idx]!;

  const updated: HourlyUptimeEntry = {
    ...current,
    total: current.total + 1,
    operational: current.operational + (entry.status === "operational" ? 1 : 0),
    degraded: current.degraded + (entry.status === "degraded" ? 1 : 0),
    down: current.down + (entry.status === "down" ? 1 : 0),
    latencySumMs:
      current.latencySumMs +
      (entry.latencyMs != null && Number.isFinite(entry.latencyMs) ? entry.latencyMs : 0),
    latencyCount:
      current.latencyCount + (entry.latencyMs != null && Number.isFinite(entry.latencyMs) ? 1 : 0),
  };

  if (idx === -1) {
    next.push(updated);
  } else {
    next[idx] = updated;
  }

  const cutoff = new Date(normalized.getTime() - 26 * 60 * 60 * 1000);
  const cutoffHour = cutoff.toISOString().slice(0, 13) + ":00:00.000Z";

  const trimmed = next
    .filter((e) => e.hour >= cutoffHour)
    .sort((a, b) => a.hour.localeCompare(b.hour))
    .slice(-60);

  await setMonitorMetadataValues(
    HOURLY_UPTIME_KEY,
    trimmed.map((i) => JSON.stringify(i)),
  );
}
