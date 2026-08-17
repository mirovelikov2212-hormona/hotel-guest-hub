import "server-only";

import { createHash } from "node:crypto";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const REQUIRED_CERTIFICATION_CHECKS = [
  "generic_staff_runtime",
  "tenant_isolation",
  "preview_build",
  "runtime_errors",
  "supabase_security",
  "integration_placeholders",
  "reporting_fail_closed",
  "branding_placeholder",
  "knowledge_placeholder",
] as const;

type CertificationCheckKey = (typeof REQUIRED_CERTIFICATION_CHECKS)[number];

type CertificationRpcRow = {
  certification_run_id: string;
  sandbox_hotel_id: string;
  sandbox_revision_id: string;
  replayed: boolean;
};

function normalizeUuid(value: unknown) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("P2_5_ENVELOPE_PROJECTION_RUN_ID_INVALID");
  }
  return id;
}

function normalizeEvidence(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("P2_5_CERTIFICATION_EVIDENCE_INVALID");
  }
  return value as Record<string, unknown>;
}

function buildChecks(input: Record<string, unknown>) {
  const checks: Record<CertificationCheckKey, true> = Object.create(null);
  for (const key of REQUIRED_CERTIFICATION_CHECKS) {
    if (input[key] !== true) throw new Error(`P2_5_REQUIRED_CHECK_NOT_PASSED:${key}`);
    checks[key] = true;
  }
  return checks;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

export async function certifyFactorySandbox(input: {
  authority: PlatformAdminAuthority;
  envelopeProjectionRunId: unknown;
  checks: unknown;
  evidence: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P2_5_FACTORY_ADMIN_FORBIDDEN");
  }

  const envelopeProjectionRunId = normalizeUuid(input.envelopeProjectionRunId);
  const checksInput = normalizeEvidence(input.checks);
  const evidence = normalizeEvidence(input.evidence);
  const requiredChecks = buildChecks(checksInput);
  const checks = { ...requiredChecks, evidence };
  const evidenceHash = createHash("sha256")
    .update(canonicalize({ schemaVersion: "p2.5", envelopeProjectionRunId, checks }))
    .digest("hex");

  // Reviewed platform-authority mutation: the RPC rechecks the active Platform
  // Admin, exact P2.4 lineage, all fail-closed gates, and changes Sandbox only.
  // Production must remain inactive/reserved or the transaction fails.
  const { data, error } = await supabaseAdmin.rpc("certify_factory_sandbox_v1", {
    p_actor_admin_id: input.authority.adminId,
    p_envelope_projection_run_id: envelopeProjectionRunId,
    p_evidence_hash: evidenceHash,
    p_checks: checks,
  });

  if (error) throw new Error(`P2_5_SANDBOX_CERTIFICATION_FAILED:${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as CertificationRpcRow | null;
  if (!row) throw new Error("P2_5_SANDBOX_CERTIFICATION_EMPTY_RESULT");

  return {
    certificationRunId: row.certification_run_id,
    sandboxHotelId: row.sandbox_hotel_id,
    sandboxRevisionId: row.sandbox_revision_id,
    replayed: Boolean(row.replayed),
    evidenceHash,
  };
}
