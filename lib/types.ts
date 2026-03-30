export type SystemStatus = "operational" | "degraded" | "down";

export type IncidentSeverity = "minor" | "major" | "critical";

export type IncidentCategory = "engineering" | "product" | "operational";

export type IncidentUrgency = "low" | "high";

export type Incident = {
  id: string;
  title: string;
  status: "open" | "resolved";
  severity: IncidentSeverity;
  category: IncidentCategory;
  urgency: IncidentUrgency;
  planned: boolean;
  createdAt: string;
  resolvedAt?: string;
  summary?: string;
  cause?: string;
  resolution?: string;
};

export type MonitorState = {
  currentStatus: SystemStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastCheckedAt: string | null;
  lastStateChangeAt: string | null;
  downtimeStartedAt: string | null;
  incidents: Incident[];
  activeLocalIncidentId: string | null;
  activeIncidentIoId: string | null;
  monitoredUrl: string;
  lastLatencyMs: number | null;
};

export type StatusResponse = {
  status: SystemStatus;
  monitoredUrl: string;
  lastCheckedAt: string | null;
  lastStateChangeAt: string | null;
  downtimeStartedAt: string | null;
  lastLatencyMs: number | null;
  incidents: Incident[];
  activeLocalIncidentId: string | null;
  activeIncidentIoId: string | null;
  recentChecks?: Array<{
    at: string;
    status: SystemStatus;
    latencyMs: number | null;
  }>;
  hourlyUptime?: Array<{
    hour: string;
    status: SystemStatus;
    uptimePercent: number | null;
    totalChecks: number;
  }>;
  stats?: {
    uptime24hPercent: number | null;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
    checkCount: number;
    windowHours: number;
  };
};
