import { FatalError } from "workflow";

import type { HotelScannerV2OutputLanguage } from "@/lib/ai/hotel-scanner-v2-domain-extractors-safe";
import { runHotelIntakePipelineV2 } from "@/lib/server/hotel-scanner-v2-pipeline";

export type HotelScannerV2WorkflowInput = {
  url: string;
  outputLanguage: HotelScannerV2OutputLanguage;
};

async function runStableScannerPipelineStep(input: HotelScannerV2WorkflowInput) {
  "use step";

  const startedAt = Date.now();
  console.log("scanner_v2_workflow_step_started", {
    url: input.url,
    outputLanguage: input.outputLanguage,
  });

  try {
    const result = await runHotelIntakePipelineV2(input);
    console.log("scanner_v2_workflow_step_completed", {
      url: input.url,
      pipelineStatus: result.pipelineStatus,
      totalLatencyMs: result.diagnostics?.totalLatencyMs ?? Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("scanner_v2_workflow_step_failed", {
      url: input.url,
      elapsedMs: Date.now() - startedAt,
      error: message,
    });

    // MVP safety: one scanner execution per workflow run. We deliberately do not
    // auto-retry the whole AI/PDF pipeline yet because retries can multiply cost
    // and hide deterministic extraction failures. Stage-specific retry policy comes
    // in the next slice after orchestration is proven stable.
    throw new FatalError(message || "scanner_v2_workflow_failed");
  }
}

export async function hotelScannerV2Workflow(input: HotelScannerV2WorkflowInput) {
  "use workflow";

  return runStableScannerPipelineStep(input);
}
