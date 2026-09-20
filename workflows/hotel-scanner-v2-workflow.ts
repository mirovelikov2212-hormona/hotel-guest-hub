import { defineHook, FatalError } from "workflow";

import type { HotelScannerV2OutputLanguage } from "@/lib/ai/hotel-scanner-v2-domain-extractors-safe";
import { persistHotelScannerV2Result } from "@/lib/server/hotel-intelligence-persistence-v2";
import {
  runHotelIntakePipelineV2FromDiscovery,
  type HotelIntakePipelineV2Result,
} from "@/lib/server/hotel-scanner-v2-pipeline";
import {
  discoverHotelIntakeRenderedV2,
  resumeHotelIntakeRenderedV3,
  type HotelIntakeV2DiscoveryResult,
} from "@/lib/server/hotel-scanner-v2-intake";
import type { HotelScannerV2EvidenceBundle } from "@/lib/server/hotel-scanner-v2-crawler";

export type HotelScannerV2WorkflowInput = {
  scanRunId: string;
  actorAdminId: string;
  url: string;
  outputLanguage: HotelScannerV2OutputLanguage;
  inventoryAuthority?: Record<string, unknown>;
  discoveryCheckpoint?: HotelScannerV2EvidenceBundle;
  discoveryCheckpointLatencyMs?: number;
};

type ScannerV2DiscoveryCheckpoint = {
  discovery: HotelIntakeV2DiscoveryResult;
  discoveryLatencyMs: number;
};

export const scannerV2QuotaResumeHook = defineHook<{
  action: "retry_after_billing";
}>();

function quotaResumeToken(input: Pick<HotelScannerV2WorkflowInput, "actorAdminId" | "scanRunId">) {
  return `${input.actorAdminId}:${input.scanRunId}`;
}

function hasQuotaExhaustion(result: HotelIntakePipelineV2Result) {
  return result.extraction.issues.some((issue) => issue.code === "AI_QUOTA_EXHAUSTED");
}

async function runDiscoveryCheckpointStep(input: HotelScannerV2WorkflowInput): Promise<ScannerV2DiscoveryCheckpoint> {
  "use step";

  const startedAt = Date.now();
  console.log("scanner_v2_workflow_discovery_started", {
    url: input.url,
    outputLanguage: input.outputLanguage,
    resumedFromQuickCheckpoint: Boolean(input.discoveryCheckpoint),
    checkpointPageCount: input.discoveryCheckpoint?.pages?.length || 0,
  });

  const discovery = input.discoveryCheckpoint
    ? await resumeHotelIntakeRenderedV3(input.discoveryCheckpoint)
    : await discoverHotelIntakeRenderedV2(input.url);
  const discoveryLatencyMs = Math.max(0, Number(input.discoveryCheckpointLatencyMs || 0))
    + (Date.now() - startedAt);
  console.log("scanner_v2_workflow_discovery_completed", {
    url: input.url,
    discoveryLatencyMs,
    pageCount: discovery.evidence.pages.length,
    resourceCount: discovery.siteMap.resources.length,
    inventorySnapshotId: discovery.evidence.v3InventorySnapshot?.snapshotId || "",
    resumedFromQuickCheckpoint: Boolean(input.discoveryCheckpoint),
  });
  return { discovery, discoveryLatencyMs };
}

async function runEnrichmentStep(
  input: HotelScannerV2WorkflowInput,
  checkpoint: ScannerV2DiscoveryCheckpoint,
  attempt: number,
) {
  "use step";

  const startedAt = Date.now();
  console.log("scanner_v2_workflow_enrichment_started", {
    url: input.url,
    outputLanguage: input.outputLanguage,
    attempt,
  });

  try {
    const result = await runHotelIntakePipelineV2FromDiscovery({
      discovery: checkpoint.discovery,
      outputLanguage: input.outputLanguage,
      discoveryLatencyMs: checkpoint.discoveryLatencyMs,
      inventoryAuthority: input.inventoryAuthority,
    });
    console.log("scanner_v2_workflow_enrichment_completed", {
      url: input.url,
      attempt,
      pipelineStatus: result.pipelineStatus,
      quotaExhausted: hasQuotaExhaustion(result),
      totalLatencyMs: result.diagnostics?.totalLatencyMs ?? Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("scanner_v2_workflow_enrichment_failed", {
      url: input.url,
      attempt,
      elapsedMs: Date.now() - startedAt,
      error: message,
    });

    // Paid AI work must never be multiplied by automatic workflow retries.
    // Billing/quota exhaustion is represented in the successful blocked result
    // and handled by the durable resume hook below.
    throw new FatalError(message || "scanner_v2_workflow_enrichment_failed");
  }
}

async function persistScannerResultStep(input: HotelScannerV2WorkflowInput, result: HotelIntakePipelineV2Result) {
  "use step";

  try {
    return await persistHotelScannerV2Result({
      result,
      scanRunId: input.scanRunId,
      actorAdminId: input.actorAdminId,
      outputLanguage: input.outputLanguage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Authorization/identity failures are deterministic and cannot become valid
    // by repeating the same database call. Stop immediately instead of burning
    // the default 3 workflow retries.
    if (message.includes("V2_ADMIN_")) {
      throw new FatalError(message);
    }

    throw error;
  }
}

export async function hotelScannerV2Workflow(input: HotelScannerV2WorkflowInput) {
  "use workflow";

  const checkpoint = await runDiscoveryCheckpointStep(input);
  let attempt = 1;
  let result = await runEnrichmentStep(input, checkpoint, attempt);

  if (hasQuotaExhaustion(result)) {
    console.warn("scanner_v2_workflow_waiting_for_billing", {
      scanRunId: input.scanRunId,
      attempt,
    });
    const resumeEvents = scannerV2QuotaResumeHook.create({ token: quotaResumeToken(input) });
    for await (const event of resumeEvents) {
      if (event.action !== "retry_after_billing") continue;
      attempt += 1;
      result = await runEnrichmentStep(input, checkpoint, attempt);
      if (!hasQuotaExhaustion(result)) break;
      console.warn("scanner_v2_workflow_still_waiting_for_billing", {
        scanRunId: input.scanRunId,
        attempt,
      });
    }
  }

  const persistence = await persistScannerResultStep(input, result);
  console.log("scanner_v2_workflow_completed", {
    scanRunId: input.scanRunId,
    reviewId: persistence.revisionId,
    reviewStatus: persistence.reviewStatus,
    approvalEligible: persistence.approvalEligible,
  });

  // The full Scanner result can be several megabytes for a large hotel.
  // It is already durably stored in Supabase; never serialize it through the
  // workflow return channel. The status route loads a bounded client projection
  // from persisted data instead.
  return {
    scanRunId: input.scanRunId,
    reviewId: persistence.revisionId,
    reviewStatus: persistence.reviewStatus,
    approvalEligible: persistence.approvalEligible,
    downstreamHandoffAllowed: persistence.downstreamHandoffAllowed,
  };
}
