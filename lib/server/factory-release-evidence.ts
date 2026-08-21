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

type ProductionLineage = {
  candidateGitSha: string;
  mode: "production_merge_parent" | "production_squash_pr_head";
};

export type FactoryReleaseEvidence = {
  schemaVersion: "p4.6-release-evidence-v1";
  status: CheckState;
  environment: string | null;
  runtimeDeploymentId: string | null;
  runtimeProjectId: string | null;
  runtimeGitSha: string | null;
  candidateGitSha: string | null;
  lineageMode: "preview_self" | "production_merge_parent" | "production_squash_pr_head" | "unavailable";
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

function logProductionLineageDiagnostic(reason: string, details: Record<string, unknown>) {
  console.error("P2_6_PRODUCTION_LINEAGE_DIAGNOSTIC", { reason, ...details });
}

async function resolveProductionLineage(runtimeGitSha: string): Promise<ProductionLineage | null> {
  const commit = await githubJson(`/commits/${runtimeGitSha}`) as {
    parents?: Array<{ sha?: string }>;
    commit?: { message?: string };
  };
  const parents = Array.isArray(commit.parents) ? commit.parents : [];
  const mergeParent = String(parents[1]?.sha || "").trim().toLowerCase();
  const commitTitle = String(commit.commit?.message || "").split(/\r?\n/, 1)[0].trim();

  if (parents.length === 2 && SHA_PATTERN.test(mergeParent)) {
    return { candidateGitSha: mergeParent, mode: "production_merge_parent" };
  }

  if (parents.length !== 1) {
    logProductionLineageDiagnostic("unsupported_parent_count", {
      runtimeGitSha,
      parentCount: parents.length,
      mergeParentValid: SHA_PATTERN.test(mergeParent),
      commitTitle,
    });
    return null;
  }

  const pullMatch = commitTitle.match(/\(#([1-9]\d*)\)\s*$/);
  if (!pullMatch) {
    logProductionLineageDiagnostic("squash_pr_number_missing", {
      runtimeGitSha,
      parentCount: parents.length,
      commitTitle,
    });
    return null;
  }
  const pullNumber = Number(pullMatch[1]);
  if (!Number.isSafeInteger(pullNumber) || pullNumber <= 0) {
    logProductionLineageDiagnostic("invalid_squash_pr_number", {
      runtimeGitSha,
      pullNumber: pullMatch[1],
      commitTitle,
    });
    return null;
  }

  const pull = await githubJson(`/pulls/${pullNumber}`) as Record<string, unknown>;
  const mergeCommitSha = String(pull.merge_commit_sha || "").trim().toLowerCase();
  const base = pull.base as Record<string, unknown> | undefined;
  const baseRef = String(base?.ref || "");
  const mergedAtPresent = Boolean(pull.merged_at);
  const mergeCommitMatchesRuntime = mergeCommitSha === runtimeGitSha;
  let mergedEventMatchesRuntime = false;

  // GitHub's public PR detail can transiently or persistently omit merge_commit_sha
  // after a squash merge. Only when that field is absent, bind the same exact PR
  // to the runtime commit through GitHub's system-generated merged issue event.
  if (!mergeCommitSha) {
    const issueEventsRaw = await githubJson(`/issues/${pullNumber}/events?per_page=100`);
    const issueEvents = Array.isArray(issueEventsRaw) ? issueEventsRaw : [];
    mergedEventMatchesRuntime = issueEvents.some((entry) => {
      const item = entry as Record<string, unknown>;
      return item.event === "merged"
        && String(item.commit_id || "").trim().toLowerCase() === runtimeGitSha;
    });
  }

  const mergeBindingMatchesRuntime = mergeCommitMatchesRuntime || (!mergeCommitSha && mergedEventMatchesRuntime);
  if (
    !mergeBindingMatchesRuntime
    || !mergedAtPresent
    || baseRef !== "main"
  ) {
    logProductionLineageDiagnostic("squash_pr_validation_failed", {
      runtimeGitSha,
      pullNumber,
      mergeCommitSha,
      mergeCommitMatchesRuntime,
      mergedEventFallbackUsed: !mergeCommitSha,
      mergedEventMatchesRuntime,
      mergedAtPresent,
      baseRef,
    });
    return null;
  }

  const head = pull.head as Record<string, unknown> | undefined;
  const candidateGitSha = String(head?.sha || "").trim().toLowerCase();
  if (!SHA_PATTERN.test(candidateGitSha)) {
    logProductionLineageDiagnostic("invalid_squash_pr_head", {
      runtimeGitSha,
      pullNumber,
      candidateGitSha,
    });
    return null;
  }

  return { candidateGitSha, mode: "production_squash_pr_head" };
}

export async function getFactoryReleaseEvidence(): Promise<FactoryReleaseEvidence> {
  const environment = String(process.env.VERCEL_ENV || "").trim() || null;
  const runtimeDeploymentId = String(process.env.VERCEL_DEPLOYMENT_ID || "").trim() || null;
  const runtimeProjectId = String(process.env.VERCEL_PROJECT_ID || "").trim() || null;
  const rawRuntimeSha = String(process.env.VERCEL_GIT_COMMIT_SHA || "").trim().toLowerCase();
  const runtimeGitSha = SHA_PATTERN.test(rawRuntimeSha) ? rawRuntimeSha : null;

  const baseEvidence = (
    status: CheckState,
    candidateGitSha: string | null,
    lineageMode: FactoryReleaseEvidence["lineageMode"],
    releaseGateState: CheckState,
    releaseConclusion: string | null,
  ): Omit<FactoryReleaseEvidence, "evidenceHash"> => ({
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
      runId: null,
      htmlUrl: null,
      conclusion: releaseConclusion,
    },
    vercelPreview: { state: status === "failed" ? "failed" : "pending", context: VERCEL_STATUS_CONTEXT, targetUrl: null },
    requiredChecks: {
      tenant_isolation: releaseGateState,
      preview_build: status === "failed" ? "failed" : "pending",
      runtime_errors: "pending",
    },
    runtimeErrorsReason: "trusted_vercel_log_attestation_not_available",
  });

  if (!runtimeGitSha) return buildEvidence(baseEvidence("pending", null, "unavailable", "pending", null));

  try {
    let candidateGitSha = runtimeGitSha;
    let lineageMode: FactoryReleaseEvidence["lineageMode"] = "preview_self";

    if (environment === "production") {
      const productionLineage = await resolveProductionLineage(runtimeGitSha);
      if (!productionLineage) {
        return buildEvidence(baseEvidence("failed", null, "unavailable", "failed", "unsupported_release_lineage"));
      }
      candidateGitSha = productionLineage.candidateGitSha;
      lineageMode = productionLineage.mode;
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
    return buildEvidence(baseEvidence("pending", null, "unavailable", "pending", null));
  }
}
