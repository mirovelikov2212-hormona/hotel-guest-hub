import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SandboxPreflightCheckState = "pending" | "validated" | "failed";

export type FactorySandboxPreflight = {
  schemaVersion: "p2.5-preflight-v1";
  envelopeProjectionRunId: string;
  lineage: {
    onboardingRunId: string;
    coreProjectionRunId: string;
    operationalProjectionRunId: string;
    envelopeProjectionRunId: string;
    productionHotelId: string;
    sandboxHotelId: string;
    productionRevisionId: string;
    sandboxRevisionId: string;
  };
  environment: {
    propertyLifecycleState: string;
    productionActive: boolean;
    sandboxActive: boolean;
    stateValid: boolean;
  };
  databaseGates: {
    revisionLineage: boolean;
    environmentMapping: boolean;
    environmentState: boolean;
    roleTemplatesFailClosed: boolean;
    runtimeResourcesFailClosed: boolean;
    integrationPlaceholders: boolean;
    reportingFailClosed: boolean;
    brandingPlaceholder: boolean;
    knowledgePlaceholder: boolean;
    aiPermissionsFailClosed: boolean;
    identityHealthState: boolean;
    supabaseSecurity: boolean;
  };
  requiredChecks: {
    generic_staff_runtime: SandboxPreflightCheckState;
    tenant_isolation: SandboxPreflightCheckState;
    preview_build: SandboxPreflightCheckState;
    runtime_errors: SandboxPreflightCheckState;
    supabase_security: SandboxPreflightCheckState;
    integration_placeholders: SandboxPreflightCheckState;
    reporting_fail_closed: SandboxPreflightCheckState;
    branding_placeholder: SandboxPreflightCheckState;
    knowledge_placeholder: SandboxPreflightCheckState;
  };
  externalEvidenceRequired: Array<
    "generic_staff_runtime" | "tenant_isolation" | "preview_build" | "runtime_errors"
  >;
  databaseStatus: "validated" | "failed";
  evidenceStatus: SandboxPreflightCheckState;
  certification: {
    status: "not_started" | "complete";
    certificationRunId: string | null;
    evidenceHash: string | null;
    createdAt: string | null;
  };
  certificationMutationAvailable: false;
};

export async function getFactorySandboxPreflight(
  envelopeProjectionRunId: string,
): Promise<FactorySandboxPreflight | null> {
  const normalized = String(envelopeProjectionRunId || "").trim();
  if (!UUID_PATTERN.test(normalized)) return null;

  const { data, error } = await supabaseAdmin.rpc("get_factory_sandbox_preflight_v1", {
    p_envelope_projection_run_id: normalized,
  });

  if (error) {
    throw new Error(`P4_5_SANDBOX_PREFLIGHT_READ_FAILED:${error.message}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const preflight = data as unknown as FactorySandboxPreflight;
  if (
    preflight.schemaVersion !== "p2.5-preflight-v1"
    || String(preflight.envelopeProjectionRunId) !== normalized
  ) {
    throw new Error("P4_5_SANDBOX_PREFLIGHT_RESULT_MISMATCH");
  }

  return preflight;
}
