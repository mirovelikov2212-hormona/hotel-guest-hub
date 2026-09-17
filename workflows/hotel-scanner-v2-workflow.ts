import { defineHook, FatalError } from "workflow";

import type { HotelScannerV2OutputLanguage } from "@/lib/ai/hotel-scanner-v2-domain-extractors-safe";
import { persistHotelScannerV2Result } from "@/lib/server/hotel-intelligence-persistence-v2";
import {
  runHotelIntakePipelineV2FromDiscovery,
  type HotelIntakePipelineV2Result,
} from "@/lib/server/hotel-scanner-v2-pipeline";
import {
  discoverHotelIntakeV2,
  type HotelIntakeV2DiscoveryResult,
} from "@/lib/server/hotel-scanner-v2-intake";

export type HotelScannerV2WorkflowInput = {
  scanRunId: string;
  actorAdminId: string;
  url: string;
  outputLanguage: HotelScannerV2OutputLanguage;
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
  return result.extraction.issues.some((issue) => issue.code === "AI_QUOTA_EXHAUSTED")
    || result.documents.documents.some((document) => document.error === "document_ai_quota_exhausted");
}

async function runDiscoveryCheckpointStep(input: HotelScannerV2WorkflowInput): Promise<ScannerV2DiscoveryCheckpoint> {
  "use step";

  const startedAt = Date.now();
  console.log("scanner_v2_workflow_discovery_started", {
    url: input.url,
    outputLanguage: input.outputLanguage,
  });

  const discovery = await discoverHotelIntakeV2(input.url);
  const discoveryLatencyMs = Date.now() - startedAt;
  console.log("scanner_v2_workflow_discovery_completed", {
    url: input.url,
    discoveryLatencyMs,
    pageCount: discovery.evidence.pages.length,
    resourceCount: discovery.siteMap.resources.length,
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

  return persistHotelScannerV2Result({ result, scanRunId: input.scanRunId, actorAdminId: input.actorAdminId, outputLanguage: input.outputLanguage });
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
  return { ...result, persistence };
}
