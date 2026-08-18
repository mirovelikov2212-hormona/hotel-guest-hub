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

export async function probeFactorySandboxGenericStaffRuntime(
  preflight: FactorySandboxPreflight,
): Promise<FactorySandboxRuntimeProbe> {
  const envelopeProjectionRunId = String(preflight.envelopeProjectionRunId || "");
  const sandboxHotelId = String(preflight.lineage.sandboxHotelId || "");
  const sandboxRevisionId = String(preflight.lineage.sandboxRevisionId || "");

  const { data, error } = await supabaseAdmin
    .from("departments")
    .select("id, code")
    .eq("hotel_id", sandboxHotelId)
    .eq("active", true)
    .order("code", { ascending: true });

  if (error) {
    throw new Error(`P4_6_SANDBOX_RUNTIME_DEPARTMENTS_READ_FAILED:${error.message}`);
  }

  const rows = (data || []).map((row) => ({
    id: String(row.id),
    code: String(row.code || "").trim().toLowerCase(),
  }));

  const departments = await Promise.all(
    rows.map(async (row) => {
      const resolved = await resolveStaffRuntimeRoleForHotelId(sandboxHotelId, row.code);
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

  const manager = await resolveStaffRuntimeRoleForHotelId(sandboxHotelId, "manager");
  const managerResolved = Boolean(manager && manager.kind === "manager" && manager.departmentId === null);
  const status = rows.length > 0 && departments.every((department) => department.resolved) && managerResolved
    ? "validated"
    : "failed";

  const evidence = {
    schemaVersion: "p4.6-sandbox-runtime-probe-v1" as const,
    envelopeProjectionRunId,
    sandboxHotelId,
    sandboxRevisionId,
    departmentCount: departments.length,
    departments,
    managerResolved,
    status,
  };
  const evidenceHash = createHash("sha256").update(canonicalize(evidence)).digest("hex");

  return { ...evidence, evidenceHash };
}
