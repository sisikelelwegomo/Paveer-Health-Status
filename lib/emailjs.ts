type EmailJsConfig = {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey?: string;
};

type SendEmailJsArgs = {
  config: EmailJsConfig;
  templateParams: Record<string, unknown>;
};

function getEmailJsConfig(): EmailJsConfig {
  const serviceId = process.env.EMAILJS_SERVICE_ID ?? "";
  const templateId = process.env.EMAILJS_TEMPLATE_ID ?? "";
  const publicKey = process.env.EMAILJS_PUBLIC_KEY ?? "";
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateId || !publicKey) {
    const missing = [
      !serviceId ? "EMAILJS_SERVICE_ID" : null,
      !templateId ? "EMAILJS_TEMPLATE_ID" : null,
      !publicKey ? "EMAILJS_PUBLIC_KEY" : null,
    ].filter(Boolean);
    throw new Error(`Missing EmailJS configuration env vars: ${missing.join(", ")}`);
  }

  return { serviceId, templateId, publicKey, privateKey };
}

async function sendEmailJs({ config, templateParams }: SendEmailJsArgs): Promise<void> {
  const body: Record<string, unknown> = {
    service_id: config.serviceId,
    template_id: config.templateId,
    user_id: config.publicKey,
    template_params: templateParams,
  };

  if (config.privateKey) {
    body.accessToken = config.privateKey;
  }

  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EmailJS send failed: ${res.status} ${text}`);
  }
}

export function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export async function sendDownEmail(monitoredUrl: string, at: Date): Promise<void> {
  const config = getEmailJsConfig();
  const emailTo = process.env.EMAIL_TO ?? "";
  const emailFrom = process.env.EMAIL_FROM ?? "";

  await sendEmailJs({
    config,
    templateParams: {
      status: "DOWN",
      subject: "Paveer System Health: DOWN",
      status_label: "DOWN",
      monitored_url: monitoredUrl,
      timestamp: formatTimestamp(at),
      downtime_duration: "",
      email_to: emailTo,
      email_from: emailFrom,
      to_email: emailTo,
      from_email: emailFrom,
      reply_to: emailFrom,
    },
  });
}

export async function sendRecoveredEmail(
  monitoredUrl: string,
  at: Date,
  downtimeDuration?: string,
): Promise<void> {
  const config = getEmailJsConfig();
  const emailTo = process.env.EMAIL_TO ?? "";
  const emailFrom = process.env.EMAIL_FROM ?? "";

  await sendEmailJs({
    config,
    templateParams: {
      status: "RECOVERED",
      subject: "Paveer System Health: RECOVERED",
      status_label: "RECOVERED",
      monitored_url: monitoredUrl,
      timestamp: formatTimestamp(at),
      downtime_duration: downtimeDuration,
      email_to: emailTo,
      email_from: emailFrom,
      to_email: emailTo,
      from_email: emailFrom,
      reply_to: emailFrom,
    },
  });
}

export function formatDuration(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime();
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}
