import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";

import { canMutateControlPlane } from "@/lib/server/control-plane-auth";
import { enforceControlPlaneSameOrigin } from "@/lib/server/control-plane-origin";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { discoverHotelIntakeQuickV2 } from "@/lib/server/hotel-scanner-v2-intake";
import { buildHotelScannerV2QuickPreview } from "@/lib/server/hotel-scanner-v2-quick-preview";
import {
  projectHotelInventoryAuthorityV3,
  summarizeHotelInventoryAuthorityV3,
} from "@/lib/server/hotel-scanner-v3-canonical-inventory.mjs";
import { createHotelInventoryAuthorityTokenV3 } from "@/lib/server/hotel-scanner-v3-authority-token";
import {
  hotelScannerDiscoveryCheckpointBytesV3,
  projectHotelScannerDiscoveryCheckpointV3,
} from "@/lib/server/hotel-scanner-v3-discovery-checkpoint";
import { createScannerV2WorkflowAccessToken } from "@/lib/server/hotel-scanner-v2-workflow-access";
import { hotelScannerV2Workflow } from "@/workflows/hotel-scanner-v2-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const MAX_INLINE_WORKFLOW_CHECKPOINT_BYTES = 750_000;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const originError = enforceControlPlaneSameOrigin(request);
  if (originError) return originError;
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canMutateControlPlane(authority.role)) return json({ ok: false, error: "forbidden" }, 403);

  const body = (await request.json().catch(() => ({}))) as { url?: unknown; lang?: unknown };
  const url = String(body.url || "").trim();
  const outputLanguage = String(body.lang || "bg").trim().toLocaleLowerCase("en-US") === "en" ? "en" : "bg";
  if (!url) return json({ ok: false, error: "missing_url" }, 400);

  const startedAt = Date.now();
  try {
    const discovery = await discoverHotelIntakeQuickV2(url);
    const preview = buildHotelScannerV2QuickPreview(discovery);
    const snapshot = discovery.evidence.v3InventorySnapshot;
    const structuralCrawl = discovery.evidence.discovery.structuralCrawl;
    const authorityEligible = Boolean(
      snapshot
      && structuralCrawl?.inventoryClosed
      && !structuralCrawl?.safetyCapReached
      && snapshot.status === "READY"
    );
    const inventoryAuthority = authorityEligible && snapshot
      ? projectHotelInventoryAuthorityV3(snapshot)
      : null;
    const inventoryAuthorityToken = inventoryAuthority
      ? createHotelInventoryAuthorityTokenV3({
          actorAdminId: authority.adminId,
          requestedUrl: url,
          authority: inventoryAuthority,
        })
      : "";

    const checkpoint = projectHotelScannerDiscoveryCheckpointV3(discovery.evidence);
    const checkpointBytes = hotelScannerDiscoveryCheckpointBytesV3(checkpoint);
    let workflow: {
      runId: string;
      scanRunId: string;
      runAccessToken: string;
      status: string;
      reusedDiscovery: true;
    } | null = null;

    if (checkpointBytes <= MAX_INLINE_WORKFLOW_CHECKPOINT_BYTES) {
      try {
        const scanRunId = randomUUID();
        const run = await start(hotelScannerV2Workflow, [{
          url,
          outputLanguage,
          actorAdminId: authority.adminId,
          scanRunId,
          inventoryAuthority: inventoryAuthority || undefined,
          discoveryCheckpoint: checkpoint,
          discoveryCheckpointLatencyMs: Date.now() - startedAt,
        }]);
        workflow = {
          runId: run.runId,
          scanRunId,
          runAccessToken: createScannerV2WorkflowAccessToken({
            actorAdminId: authority.adminId,
            runId: run.runId,
            scanRunId,
          }),
          status: await run.status,
          reusedDiscovery: true,
        };
      } catch (workflowError) {
        console.warn("scanner_v3_quick_checkpoint_workflow_start_failed", {
          error: workflowError instanceof Error ? workflowError.message : String(workflowError),
          checkpointBytes,
        });
      }
    }

    return json({
      ok: true,
      mode: "quick_preview",
      runtimeMs: Date.now() - startedAt,
      ...preview,
      inventoryAuthority: inventoryAuthority
        ? summarizeHotelInventoryAuthorityV3(inventoryAuthority)
        : preview.inventoryAuthority || null,
      inventoryAuthorityToken,
      inventoryAuthorityEligible: authorityEligible,
      workflow,
      checkpoint: {
        reusable: Boolean(workflow),
        bytes: checkpointBytes,
        maxInlineBytes: MAX_INLINE_WORKFLOW_CHECKPOINT_BYTES,
        fallbackRequired: !workflow,
      },
    });
  } catch (error) {
    console.error("scanner_v2_quick_preview_failed", { error: error instanceof Error ? error.message : String(error) });
    return json({ ok: false, error: "scanner_v2_quick_preview_failed" }, 502);
  }
}
