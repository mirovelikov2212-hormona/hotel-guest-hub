import "server-only";

import { createHash } from "node:crypto";

import type { FactorySandboxPreflight } from "@/lib/server/factory-sandbox-preflight";
import { resolveStaffRuntimeRoleForHotelId } from "@/lib/server/staff-runtime-role";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "null" : serialized;
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

export type FactorySandboxRuntimeProbe = {
  schemaVersion: "p4.6-sandbox-runtime-probe-v1";
  status: "validated" | "failed";
  reason: "none" | "departments_read_failed" | "no_active_departments" | "role_resolution_failed";
  envelopeProjectionRunId: string;
  sandboxHotelId: string;
  sandboxRevisionId: string;
  departmentCount: number;
  departments: Array<{
    id: string;
    code: string;
    resolved: boolean;
  }>;
  managerResolved: boolean;
  evidenceHash: string;
};

export type FactorySandboxRuntimeProbeLineage = {
  envelopeProjectionRunId: string;
  sandboxHotelId: string;
  sandboxRevisionId: string;
};

type ProbeEvidence = Omit<FactorySandboxRuntimeProbe, "evidenceHash">;

function finish(evidence: ProbeEvidence): FactorySandboxRuntimeProbe {
  const evidenceHash = createHash("sha256").update(canonicalize(evidence)).digest("hex");
  return { ...evidence, evidenceHash };
}

export async function probeFactorySandboxGenericStaffRuntimeByLineage(
  lineage: FactorySandboxRuntimeProbeLineage,
): Promise<FactorySandboxRuntimeProbe> {
  const envelopeProjectionRunId = String(lineage.envelopeProjectionRunId || "");
  const sandboxHotelId = String(lineage.sandboxHotelId || "");
  const sandboxRevisionId = String(lineage.sandboxRevisionId || "");
  const base = { envelopeProjectionRunId, sandboxHotelId, sandboxRevisionId };

  const { data, error } = await supabaseAdmin
    .from("departments")
    .select("id, code")
    .eq("hotel_id", sandboxHotelId)
    .eq("active", true)
    .order("code", { ascending: true });

  if (error) {
    return finish({
      schemaVersion: "p4.6-sandbox-runtime-probe-v1",
      status: "failed",
      reason: "departments_read_failed",
      ...base,
      departmentCount: 0,
      departments: [],
      managerResolved: false,
    });
  }

  const rows = (data || []).map((row) => ({
    id: String(row.id),
    code: String(row.code || "").trim().toLowerCase(),
  }));

  if (rows.length === 0) {
    return finish({
      schemaVersion: "p4.6-sandbox-runtime-probe-v1",
      status: "failed",
      reason: "no_active_departments",
      ...base,
      departmentCount: 0,
      departments: [],
      managerResolved: false,
    });
  }

  const departments = await Promise.all(
    rows.map(async (row) => {
      const resolved = await resolveStaffRuntimeRoleForHotelId(sandboxHotelId, row.code).catch(() => null);
      return {
        id: row.id,
        code: row.code,
        resolved: Boolean(
          resolved
          && resolved.kind === "department"
          && String(resolved.departmentId) === row.id
          && String(resolved.departmentCode) === row.code,
        ),
      };
    }),
  );

  const manager = await resolveStaffRuntimeRoleForHotelId(sandboxHotelId, "manager").catch(() => null);
  const managerResolved = Boolean(manager && manager.kind === "manager" && manager.departmentId === null);
  const status = departments.every((department) => department.resolved) && managerResolved
    ? "validated"
    : "failed";

  return finish({
    schemaVersion: "p4.6-sandbox-runtime-probe-v1",
    status,
    reason: status === "validated" ? "none" : "role_resolution_failed",
    ...base,
    departmentCount: departments.length,
    departments,
    managerResolved,
  });
}

export async function probeFactorySandboxGenericStaffRuntime(
  preflight: FactorySandboxPreflight,
): Promise<FactorySandboxRuntimeProbe> {
  return probeFactorySandboxGenericStaffRuntimeByLineage({
    envelopeProjectionRunId: String(preflight.envelopeProjectionRunId || ""),
    sandboxHotelId: String(preflight.lineage.sandboxHotelId || ""),
    sandboxRevisionId: String(preflight.lineage.sandboxRevisionId || ""),
  });
}
