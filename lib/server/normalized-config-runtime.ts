import "server-only";

import type { HotelConfig } from "@/lib/types";
import {
  buildSandboxNormalizedRuntimeConfig,
  type NormalizedProjectionRows,
  type NormalizedProjectionState,
  type NormalizedRuntimeResult,
} from "@/lib/server/normalized-config-runtime-model.mjs";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type PublishedConfigForRuntime = {
  revisionId: string;
  sourceChecksum: string;
  config: HotelConfig;
};

type DepartmentRow = Record<string, unknown> & {
  id?: string | null;
  code?: string | null;
};

type RoutingRuleRow = Record<string, unknown> & {
  department_id?: string | null;
  after_hours_department_id?: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function metadataActivatesRuntimeReads(state: NormalizedProjectionState | null) {
  return Boolean(
    isObject(state?.metadata_json) &&
      state.metadata_json.runtimeReadsActivated === true,
  );
}

export async function getNormalizedProjectionState(
  hotelId: string,
): Promise<NormalizedProjectionState | null> {
  const { data, error } = await supabaseAdmin
    .from("hotel_config_projection_state")
    .select(
      "projected_revision_id, projected_source_checksum, projection_status, rooms_count, active_rooms_count, departments_count, active_departments_count, routing_rules_count, active_routing_rules_count, last_error_code, last_error_message, metadata_json",
    )
    .eq("hotel_id", hotelId)
    .maybeSingle();

  if (error) {
    throw new Error(`Normalized projection state lookup failed: ${error.message}`);
  }

  return (data as NormalizedProjectionState | null) ?? null;
}

export async function getActiveNormalizedProjectionRows(
  hotelId: string,
): Promise<NormalizedProjectionRows> {
  const [roomsResult, departmentsResult, routingRulesResult] =
    await Promise.all([
      supabaseAdmin
        .from("rooms")
        .select("room_number, floor, building, room_type, active")
        .eq("hotel_id", hotelId)
        .eq("active", true),
      supabaseAdmin
        .from("departments")
        .select(
          "id, code, name, whatsapp_number, email, opens_at, closes_at, is_24h, active",
        )
        .eq("hotel_id", hotelId)
        .eq("active", true),
      supabaseAdmin
        .from("routing_rules")
        .select(
          "request_type, department_id, after_hours_department_id, priority_default, auto_assign_mode, active",
        )
        .eq("hotel_id", hotelId)
        .is("venue_type", null)
        .eq("active", true),
    ]);

  const firstError =
    roomsResult.error || departmentsResult.error || routingRulesResult.error;
  if (firstError) {
    throw new Error(`Normalized projection row lookup failed: ${firstError.message}`);
  }

  const departments = (departmentsResult.data || []) as DepartmentRow[];
  const departmentCodeById = new Map(
    departments.map((department) => [
      String(department.id || ""),
      String(department.code || ""),
    ]),
  );

  const routingRules = ((routingRulesResult.data || []) as RoutingRuleRow[]).map(
    (routingRule) => ({
      ...routingRule,
      department_code:
        departmentCodeById.get(String(routingRule.department_id || "")) || "",
      after_hours_department_code:
        departmentCodeById.get(
          String(routingRule.after_hours_department_id || ""),
        ) || null,
    }),
  );

  return {
    rooms: (roomsResult.data || []) as Array<Record<string, unknown>>,
    departments,
    routingRules,
  };
}

export async function resolveNormalizedHotelConfigForRuntime(input: {
  hotelId: string;
  isSandbox: boolean;
  published: PublishedConfigForRuntime;
}): Promise<NormalizedRuntimeResult> {
  if (!input.isSandbox) {
    return buildSandboxNormalizedRuntimeConfig({
      isSandbox: false,
      publishedRevisionId: input.published.revisionId,
      publishedChecksum: input.published.sourceChecksum,
      publishedConfig: input.published.config,
      projectionState: null,
    });
  }

  const projectionState = await getNormalizedProjectionState(input.hotelId);

  if (!metadataActivatesRuntimeReads(projectionState)) {
    return buildSandboxNormalizedRuntimeConfig({
      isSandbox: true,
      publishedRevisionId: input.published.revisionId,
      publishedChecksum: input.published.sourceChecksum,
      publishedConfig: input.published.config,
      projectionState,
    });
  }

  const rows = await getActiveNormalizedProjectionRows(input.hotelId);

  return buildSandboxNormalizedRuntimeConfig({
    isSandbox: true,
    publishedRevisionId: input.published.revisionId,
    publishedChecksum: input.published.sourceChecksum,
    publishedConfig: input.published.config,
    projectionState,
    rows,
  });
}
