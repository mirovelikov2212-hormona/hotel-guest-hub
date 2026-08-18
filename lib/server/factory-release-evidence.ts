import "server-only";

import { createHash } from "node:crypto";

const GITHUB_OWNER = "mirovelikov2212-hormona";
const GITHUB_REPO = "hotel-guest-hub";
const RELEASE_GATE_WORKFLOW = "factory-release-gate.yml";
const VERCEL_STATUS_CONTEXT = "Vercel";
const VERCEL_TARGET_PREFIX = "https://vercel.com/miroslav-velikovs-projects/hotel-guest-hub/";
const SHA_PATTERN = /^[a-f0-9]{40}$/;

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "null" : serialized;
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

async function githubJson(path: string): Promise<unknown> {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "StayHub-Product-Factory",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(7_000),
  });
  if (!response.ok) throw new Error(`GITHUB_HTTP_${response.status}`);
  return response.json();
}

type CheckState = "pending" | "validated" | "failed";

export type FactoryReleaseEvidence = {
  schemaVersion: "p4.6-release-evidence-v1";
  status: CheckState;
  environment: string | null;
  runtimeDeploymentId: string | null;
  runtimeProjectId: string | null;
  runtimeGitSha: string | null;
  candidateGitSha: string | null;
  lineageMode: "preview_self" | "production_merge_parent" | "unavailable";
  releaseGate: {
    state: CheckState;
    workflow: string;
    runId: number | null;
    htmlUrl: string | null;
    conclusion: string | null;
  };
  vercelPreview: {
    state: CheckState;
    context: string;
    targetUrl: string | null;
  };
  requiredChecks: {
    tenant_isolation: CheckState;
    preview_build: CheckState;
    runtime_errors: "pending";
  };
  runtimeErrorsReason: "trusted_vercel_log_attestation_not_available";
  evidenceHash: string;
};

function buildEvidence(input: Omit<FactoryReleaseEvidence, "evidenceHash">): FactoryReleaseEvidence {
  const evidenceHash = createHash("sha256").update(canonicalize(input)).digest("hex");
  return { ...input, evidenceHash };
}

export async function getFactoryReleaseEvidence(): Promise<FactoryReleaseEvidence> {
  const environment = String(process.env.VERCEL_ENV || "").trim() || null;
  const runtimeDeploymentId = String(process.env.VERCEL_DEPLOYMENT_ID || "").trim() || null;
  const runtimeProjectId = String(process.env.VERCEL_PROJECT_ID || "").trim() || null;
  const rawRuntimeSha = String(process.env.VERCEL_GIT_COMMIT_SHA || "").trim().toLowerCase();
  const runtimeGitSha = SHA_PATTERN.test(rawRuntimeSha) ? rawRuntimeSha : null;

  const pending = (candidateGitSha: string | null, lineageMode: FactoryReleaseEvidence["lineageMode"]): FactoryReleaseEvidence => buildEvidence({
    schemaVersion: "p4.6-release-evidence-v1",
    status: "pending",
    environment,
    runtimeDeploymentId,
    runtimeProjectId,
    runtimeGitSha,
    candidateGitSha,
    lineageMode,
    releaseGate: { state: "pending", workflow: RELEASE_GATE_WORKFLOW, runId: null, htmlUrl: null, conclusion: null },
    vercelPreview: { state: "pending", context: VERCEL_STATUS_CONTEXT, targetUrl: null },
    requiredChecks: { tenant_isolation: "pending", preview_build: "pending", runtime_errors: "pending" },
    runtimeErrorsReason: "trusted_vercel_log_attestation_not_available",
  });

  if (!runtimeGitSha) return pending(null, "unavailable");

  try {
    let candidateGitSha = runtimeGitSha;
    let lineageMode: FactoryReleaseEvidence["lineageMode"] = "preview_self";

    if (environment === "production") {
      const commit = await githubJson(`/commits/${runtimeGitSha}`) as {
        parents?: Array<{ sha?: string }>;
      };
      const parents = Array.isArray(commit.parents) ? commit.parents : [];
      const mergeParent = String(parents[1]?.sha || "").trim().toLowerCase();
      if (parents.length !== 2 || !SHA_PATTERN.test(mergeParent)) {
        return buildEvidence({
          ...pending(null, "unavailable"),
          evidenceHash: undefined as never,
          status: "failed",
          lineageMode: "unavailable",
          releaseGate: { state: "failed", workflow: RELEASE_GATE_WORKFLOW, runId: null, htmlUrl: null, conclusion: "unsupported_release_lineage" },
        });
      }
      candidateGitSha = mergeParent;
      lineageMode = "production_merge_parent";
    }

    const [workflowRunsRaw, statusesRaw] = await Promise.all([
      githubJson(`/actions/workflows/${encodeURIComponent(RELEASE_GATE_WORKFLOW)}/runs?head_sha=${candidateGitSha}&event=pull_request&status=completed&per_page=20`),
      githubJson(`/commits/${candidateGitSha}/statuses?per_page=100`),
    ]);

    const workflowRuns = (workflowRunsRaw as { workflow_runs?: unknown[] })?.workflow_runs;
    const successfulRun = (Array.isArray(workflowRuns) ? workflowRuns : []).find((run) => {
      const item = run as Record<string, unknown>;
      return String(item.head_sha || "").toLowerCase() === candidateGitSha
        && item.conclusion === "success"
        && item.event === "pull_request";
    }) as Record<string, unknown> | undefined;

    const statuses = Array.isArray(statusesRaw) ? statusesRaw : [];
    const vercelStatus = statuses.find((entry) => {
      const item = entry as Record<string, unknown>;
      return item.context === VERCEL_STATUS_CONTEXT;
    }) as Record<string, unknown> | undefined;
    const vercelTargetUrl = String(vercelStatus?.target_url || "").trim();

    const releaseGateState: CheckState = successfulRun ? "validated" : "failed";
    const vercelPreviewState: CheckState = vercelStatus?.state === "success" && vercelTargetUrl.startsWith(VERCEL_TARGET_PREFIX)
      ? "validated"
      : "failed";
    const status: CheckState = releaseGateState === "validated" && vercelPreviewState === "validated"
      ? "validated"
      : "failed";

    return buildEvidence({
      schemaVersion: "p4.6-release-evidence-v1",
      status,
      environment,
      runtimeDeploymentId,
      runtimeProjectId,
      runtimeGitSha,
      candidateGitSha,
      lineageMode,
      releaseGate: {
        state: releaseGateState,
        workflow: RELEASE_GATE_WORKFLOW,
        runId: successfulRun ? Number(successfulRun.id) || null : null,
        htmlUrl: successfulRun ? String(successfulRun.html_url || "") || null : null,
        conclusion: successfulRun ? String(successfulRun.conclusion || "") || null : null,
      },
      vercelPreview: {
        state: vercelPreviewState,
        context: VERCEL_STATUS_CONTEXT,
        targetUrl: vercelTargetUrl || null,
      },
      requiredChecks: {
        tenant_isolation: releaseGateState,
        preview_build: vercelPreviewState,
        runtime_errors: "pending",
      },
      runtimeErrorsReason: "trusted_vercel_log_attestation_not_available",
    });
  } catch {
    return pending(null, "unavailable");
  }
}
