export const dynamic = "force-dynamic";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

class BetterstackError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type BetterstackMonitorResponse = {
  data?: {
    id?: string;
    type?: "monitor";
    attributes?: {
      url?: string;
      pronounceable_name?: string;
      status?: string;
      last_checked_at?: string;
    };
  };
};

type BetterstackMonitorsListResponse = {
  data?: Array<{
    id?: string;
    type?: "monitor";
    attributes?: {
      url?: string;
      pronounceable_name?: string;
      status?: string;
      last_checked_at?: string;
    };
  }>;
};

type BetterstackIncidentsResponse = {
  data?: Array<{
    id?: string;
    type?: "incident";
    attributes?: {
      name?: string;
      url?: string | null;
      cause?: string | null;
      started_at?: string | null;
      resolved_at?: string | null;
      status?: string | null;
      metadata?: Record<string, Array<{ value?: string | null }>>;
    };
    relationships?: {
      monitor?: { data?: { id?: string; type?: "monitor" } | null } | null;
    };
  }>;
};

type BetterstackIncident = NonNullable<BetterstackIncidentsResponse["data"]>[number];

async function betterstackGetJson<T>(pathname: string, searchParams?: URLSearchParams): Promise<T> {
  const apiKey = requireEnv("BETTERSTACK_API_KEY");
  const url = new URL(`https://uptime.betterstack.com${pathname}`);
  if (searchParams) url.search = searchParams.toString();

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new BetterstackError(
      `Betterstack GET ${url.pathname} failed: ${res.status}`,
      res.status,
      text,
    );
  }

  return JSON.parse(text) as T;
}

function mapMonitorStatus(status: string | undefined): { status: "operational" | "degraded" | "down"; statusText: string } {
  switch ((status ?? "").toLowerCase()) {
    case "up":
      return { status: "operational", statusText: "Operational" };
    case "down":
      return { status: "down", statusText: "Down" };
    case "validating":
    case "pending":
    case "maintenance":
    case "paused":
    default:
      return { status: "degraded", statusText: "Degraded" };
  }
}

function dateToYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function incidentMatchesTarget(
  incident: BetterstackIncident,
  monitorId: string,
  targetUrl: string,
): boolean {
  const incidentMonitorId = incident.relationships?.monitor?.data?.id;
  if (incidentMonitorId && incidentMonitorId === monitorId) return true;

  const url = incident.attributes?.url;
  if (url && url.includes(targetUrl)) return true;

  const metadataUrl = incident.attributes?.metadata?.["Monitored URL"]?.[0]?.value;
  if (metadataUrl && metadataUrl.includes(targetUrl)) return true;

  return false;
}

function parseErrorMessage(err: unknown): string {
  if (err instanceof BetterstackError) {
    return `${err.message} ${err.body}`.trim();
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function GET() {
  const generatedAt = new Date().toISOString();

  let targetUrl = "";
  let configuredMonitorId = "";

  try {
    targetUrl = requireEnv("MONITOR_TARGET_URL");
    configuredMonitorId = requireEnv("BETTERSTACK_MONITOR_ID");
  } catch (err) {
    return Response.json(
      {
        targetUrl: targetUrl || null,
        status: "degraded",
        statusText: "Service Unavailable",
        monitor: {
          id: configuredMonitorId || "",
          status: null,
          lastCheckedAt: null,
          name: null,
          url: null,
        },
        incidents: [],
        range: null,
        generatedAt,
        error: parseErrorMessage(err),
      },
      { status: 200 },
    );
  }

  const now = new Date();
  const from = dateToYmd(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const to = dateToYmd(now);

  let monitor: BetterstackMonitorResponse | null = null;
  let resolvedMonitorId = configuredMonitorId;
  let error: string | null = null;

  try {
    monitor = await betterstackGetJson<BetterstackMonitorResponse>(
      `/api/v2/monitors/${encodeURIComponent(configuredMonitorId)}`,
    );
  } catch (err) {
    if (err instanceof BetterstackError && err.status === 404) {
      try {
        const sp = new URLSearchParams();
        sp.set("url", targetUrl);
        const monitorsList = await betterstackGetJson<BetterstackMonitorsListResponse>(
          "/api/v2/monitors",
          sp,
        );
        const match = (monitorsList.data ?? []).find((m) => m.attributes?.url === targetUrl) ?? (monitorsList.data ?? [])[0];
        if (match?.id) {
          resolvedMonitorId = String(match.id);
          monitor = { data: match };
          error = `Configured monitor id not found (${configuredMonitorId}); using monitor id ${resolvedMonitorId} for ${targetUrl}.`;
        } else {
          error = parseErrorMessage(err);
        }
      } catch (fallbackErr) {
        error = `${parseErrorMessage(err)}; fallback failed: ${parseErrorMessage(fallbackErr)}`;
      }
    } else {
      error = parseErrorMessage(err);
    }
  }

  const monitorStatus = monitor?.data?.attributes?.status;
  const mapped = mapMonitorStatus(monitorStatus);

  let incidents: BetterstackIncidentsResponse | null = null;
  try {
    const sp = new URLSearchParams();
    sp.set("from", from);
    sp.set("to", to);
    sp.set("page", "1");
    incidents = await betterstackGetJson<BetterstackIncidentsResponse>("/api/v3/incidents", sp);
  } catch (err) {
    error = error ? `${error}; incidents fetch failed: ${parseErrorMessage(err)}` : `Incidents fetch failed: ${parseErrorMessage(err)}`;
  }

  const filtered = (incidents?.data ?? [])
    .filter((inc) => incidentMatchesTarget(inc, resolvedMonitorId, targetUrl))
    .map((inc) => ({
      id: String(inc.id ?? ""),
      name: inc.attributes?.name ?? "",
      url: inc.attributes?.url ?? null,
      cause: inc.attributes?.cause ?? null,
      startedAt: inc.attributes?.started_at ?? null,
      resolvedAt: inc.attributes?.resolved_at ?? null,
      status: inc.attributes?.status ?? null,
    }));

  return Response.json(
    {
      targetUrl,
      status: mapped.status,
      statusText: mapped.statusText,
      monitor: {
        id: resolvedMonitorId,
        status: monitorStatus ?? null,
        lastCheckedAt: monitor?.data?.attributes?.last_checked_at ?? null,
        name: monitor?.data?.attributes?.pronounceable_name ?? null,
        url: monitor?.data?.attributes?.url ?? null,
      },
      incidents: filtered,
      range: { from, to },
      generatedAt,
      error,
    },
    { status: 200 },
  );
}
