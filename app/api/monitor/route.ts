import { NextResponse } from "next/server";
import { runMonitorOnce } from "@/lib/monitor";

export const dynamic = "force-dynamic";

function isAuthorized(secret: string | null): boolean {
  const expected = process.env.MONITOR_CRON_SECRET;
  if (!expected) return true;
  return secret === expected;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (!isAuthorized(secret)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMonitorOnce();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function POST() {
  const secret = process.env.MONITOR_CRON_SECRET;
  if (secret) {
    return NextResponse.json(
      { ok: false, message: "Use GET /api/monitor?secret=..." },
      { status: 405 },
    );
  }

  try {
    const result = await runMonitorOnce();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
