import { NextRequest, NextResponse } from "next/server";
import { simulateDown, simulateRecover } from "@/lib/monitor";
import { addIncident, resolveIncident } from "@/lib/monitor-state";
import {
  createIncidentIoIncident,
  editIncidentIoIncident,
  incidentIoEnabled,
} from "@/lib/incident-io";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const action: string | undefined = body?.action;

    if (action === "simulate-down") {
      await simulateDown();
      return NextResponse.json({ success: true });
    }

    if (action === "simulate-recover") {
      await simulateRecover();
      return NextResponse.json({ success: true });
    }

    if (action === "seed-examples") {
      const now = Date.now();

      const checkoutIncidentId = addIncident({
        title: "Checkout errors preventing payment",
        severity: "major",
        category: "engineering",
        urgency: "high",
        planned: false,
        summary:
          "A subset of users are unable to complete checkout due to repeated 5xx responses.",
        createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      });

      const riderIncidentId = addIncident({
        title: "Delivery capacity constrained (riders not on shift)",
        severity: "major",
        category: "operational",
        urgency: "high",
        planned: false,
        summary:
          "Delivery times increased significantly due to insufficient rider coverage in multiple regions.",
        createdAt: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
        status: "resolved",
        resolvedAt: new Date(now - 7.25 * 60 * 60 * 1000).toISOString(),
        resolution: "Shift coverage restored; backlogs cleared; ETAs stabilized.",
      });

      const hotfixId = addIncident({
        title: "Hotfix deployment (planned) to reduce error rate",
        severity: "minor",
        category: "engineering",
        urgency: "high",
        planned: true,
        summary:
          "Planned emergency release to address a known regression before peak traffic.",
        createdAt: new Date(now - 20 * 60 * 60 * 1000).toISOString(),
        status: "resolved",
        resolvedAt: new Date(now - 19.5 * 60 * 60 * 1000).toISOString(),
        resolution: "Patch deployed; dashboards confirmed recovery.",
      });

      let incidentIoIds: string[] | undefined;
      if (incidentIoEnabled()) {
        const checkoutIo = await createIncidentIoIncident({
          title: "Checkout errors preventing payment",
          summary:
            "A subset of users are unable to complete checkout due to repeated 5xx responses.",
          severity: "major",
          idempotencyKey: `seed::checkout::${new Date().toISOString()}`,
        });

        const riderIo = await createIncidentIoIncident({
          title: "Delivery capacity constrained (riders not on shift)",
          summary:
            "Delivery times increased significantly due to insufficient rider coverage in multiple regions.",
          severity: "major",
          idempotencyKey: `seed::capacity::${new Date().toISOString()}`,
        });

        const hotfixIo = await createIncidentIoIncident({
          title: "Hotfix deployment (planned) to reduce error rate",
          summary:
            "Planned emergency release to address a known regression before peak traffic.",
          severity: "minor",
          idempotencyKey: `seed::hotfix::${new Date().toISOString()}`,
        });

        await editIncidentIoIncident({
          incidentId: riderIo,
          status: "resolved",
          summary: "Shift coverage restored; backlogs cleared; ETAs stabilized.",
        });

        await editIncidentIoIncident({
          incidentId: hotfixIo,
          status: "resolved",
          summary: "Patch deployed; dashboards confirmed recovery.",
        });

        incidentIoIds = [checkoutIo, riderIo, hotfixIo];
      }

      return NextResponse.json({
        success: true,
        incidents: [checkoutIncidentId, riderIncidentId, hotfixId],
        incidentIoIds,
      });
    }

    if (action === "declare-incident") {
      const title: string | undefined = body?.title;
      const summary: string | undefined = body?.summary;
      const severity: "minor" | "major" | "critical" = body?.severity ?? "major";
      const category: "engineering" | "product" | "operational" = body?.category ?? "engineering";
      const urgency: "low" | "high" = body?.urgency ?? "high";
      const planned: boolean = body?.planned ?? false;

      if (!title) {
        return NextResponse.json(
          { success: false, message: "Missing title" },
          { status: 400 },
        );
      }

      const id = addIncident({
        title,
        summary,
        severity,
        category,
        urgency,
        planned,
      });

      if (incidentIoEnabled()) {
        const incidentIoId = await createIncidentIoIncident({
          title: `Paveer System Health: ${title}`,
          summary: summary ?? "",
          severity,
          idempotencyKey: `manual::${title}::${new Date().toISOString()}`,
        });

        return NextResponse.json({ success: true, incidentId: id, incidentIoId });
      }

      return NextResponse.json({ success: true, incidentId: id });
    }

    if (action === "resolve-incident") {
      const incidentId: string | undefined = body?.incidentId;
      const incidentIoId: string | undefined = body?.incidentIoId;
      const resolution: string | undefined = body?.resolution;
      const cause: string | undefined = body?.cause;

      if (!incidentId && !incidentIoId) {
        return NextResponse.json(
          { success: false, message: "Missing incidentId" },
          { status: 400 },
        );
      }

      if (incidentId) {
        resolveIncident(incidentId, { resolution, cause });
      }

      if (incidentIoEnabled()) {
        const id = incidentIoId ?? incidentId;
        if (id) {
          await editIncidentIoIncident({
            incidentId: id,
            status: "resolved",
            summary: resolution ?? "Resolved.",
          });
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, message: "Invalid action." },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, message },
      { status: 500 },
    );
  }
}
