import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getRun, start } from "workflow/api";

import {
  hotelScannerV2Workflow,
  scannerV2QuotaResumeHook,
} from "@/workflows/hotel-scanner-v2-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_BRANCH = "feat/hotel-lifecycle-v1-intelligence-review";
// This is public.platform_admins.id for scanner-preview@stayhub.test in the isolated Preview DB.
// It is intentionally NOT auth.users.id / platform_admins.auth_user_id.
const TEST_ACTOR_ADMIN_ID = "bba95be1-80ce-4eaf-bc51-b8aa0cc98e23";
const TEST_URL = "https://pavelbanyagrand.com/";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function previewAllowed() {
  return process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_GIT_COMMIT_REF === TEST_BRANCH;
}

function summarizeResult(result: any) {
  return {
    pipelineStatus: result?.pipelineStatus ?? null,
    source: result?.source?.canonicalUrl ?? null,
    pages: result?.discovery?.siteMap?.counts?.crawledPages ?? null,
    resources: result?.discovery?.siteMap?.counts?.resources ?? null,
    expectedItems: result?.discovery?.inventory?.counts?.expectedItems ?? null,
    extraction: {
      model: result?.extraction?.diagnostics?.model ?? null,
      factCount: result?.extraction?.diagnostics?.factCount ?? null,
      aiRequestCount: result?.extraction?.diagnostics?.aiRequestCount ?? null,
      issueCount: Array.isArray(result?.extraction?.issues) ? result.extraction.issues.length : null,
      issueCodes: Array.isArray(result?.extraction?.issues)
        ? [...new Set(result.extraction.issues.map((issue: any) => issue?.code).filter(Boolean))]
        : [],
    },
    documents: result?.documents?.diagnostics ?? null,
    completeness: {
      status: result?.completeness?.status ?? null,
      prerequisitesSatisfied: result?.completeness?.prerequisitesSatisfied ?? null,
      blockingReasons: result?.completeness?.blockingReasons ?? [],
    },
    validationGate: result?.validationGate ?? null,
    persistence: result?.persistence ?? null,
  };
}

export async function GET(request: NextRequest) {
  if (!previewAllowed()) return json({ ok: false, error: "not_found" }, 404);

  const action = request.nextUrl.searchParams.get("action") || "credit";

  try {
    if (action === "credit") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return json({ ok: false, error: "openai_api_key_missing" }, 503);
      const model = String(process.env.OPENAI_HOTEL_SCANNER_MODEL || "gpt-5.6-luna").trim();
      const client = new OpenAI({ apiKey });
      const response = await client.responses.create({
        model,
        input: "Reply exactly OK.",
        max_output_tokens: 32,
        store: false,
      });
      return json({
        ok: true,
        action,
        model,
        responseStatus: response.status,
        outputText: response.output_text?.trim().slice(0, 32) || null,
      });
    }

    if (action === "start") {
      const scanRunId = randomUUID();
      const run = await start(hotelScannerV2Workflow, [{
        scanRunId,
        actorAdminId: TEST_ACTOR_ADMIN_ID,
        url: TEST_URL,
        outputLanguage: "bg",
      }]);
      return json({
        ok: true,
        action,
        runId: run.runId,
        scanRunId,
        status: await run.status,
      }, 202);
    }

    if (action === "status") {
      const runId = request.nextUrl.searchParams.get("runId") || "";
      if (!runId) return json({ ok: false, error: "missing_run_id" }, 400);
      const run = getRun(runId);
      const status = await run.status;
      if (status !== "completed") return json({ ok: true, action, runId, status });
      const result = await run.returnValue;
      return json({ ok: true, action, runId, status, result: summarizeResult(result) });
    }

    if (action === "resume") {
      const scanRunId = request.nextUrl.searchParams.get("scanRunId") || "";
      if (!scanRunId) return json({ ok: false, error: "missing_scan_run_id" }, 400);
      await scannerV2QuotaResumeHook.resume(`${TEST_ACTOR_ADMIN_ID}:${scanRunId}`, {
        action: "retry_after_billing",
      });
      return json({ ok: true, action, scanRunId, resumed: true });
    }

    return json({ ok: false, error: "invalid_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("scanner_v2_runtime_probe_failed", { action, error: message });
    return json({ ok: false, action, error: message }, 502);
  }
}
