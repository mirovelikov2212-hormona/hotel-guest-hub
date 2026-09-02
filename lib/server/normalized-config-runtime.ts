import "server-only";

import { getCache } from "@vercel/functions";

import type { HotelConfig } from "@/lib/types";
import {
  buildSandboxNormalizedDepartmentRoutingRuntimeConfig,
  buildSandboxNormalizedRoomRuntimeConfig,
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

const normalizedRuntimeCache = getCache({ namespace: "normalized-config-runtime-v1" });
const NORMALIZED_RUNTIME_TTL_SECONDS = 300;

async function readNormalizedRuntimeCache(key: string) {
  try {
    return await normalizedRuntimeCache.get(key) as NormalizedRuntimeResult | null;
  } catch (error) {
    console.warn("Normalized runtime cache read failed; using authoritative database path", { key, error });
    return null;
  }
}

async function writeNormalizedRuntimeCache(hotelId: string, key: string, value: NormalizedRuntimeResult) {
  try {
    await normalizedRuntimeCache.set(key, value, {
      ttl: NORMALIZED_RUNTIME_TTL_SECONDS,
      tags: ["normalized-config-runtime", `hotel-config:${hotelId}`],
      name: "normalized-config-runtime",
    });
  } catch (error) {
    console.warn("Normalized runtime cache write failed; continuing with authoritative result", { hotelId, key, error });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function metadataActivatesRoomReads(state: NormalizedProjectionState | null) {
  return Boolean(
    isObject(state?.metadata_json) &&
      state.metadata_json.runtimeRoomReadsActivated === true,
  );
}

function metadataActivatesDepartmentRoutingReads(
  state: NormalizedProjectionState | null,
) {
  return Boolean(
    isObject(state?.metadata_json) &&
      state.metadata_json.runtimeDepartmentRoutingReadsActivated === true,
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

export async function getActiveNormalizedRoomRows(
  hotelId: string,
): Promise<NormalizedProjectionRows> {
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select("id, room_number, floor, building, room_type, active")
    .eq("hotel_id", hotelId)
    .eq("active", true);

  if (error) {
    throw new Error(`Normalized room lookup failed: ${error.message}`);
  }

  return {
    rooms: (data || []) as Array<Record<string, unknown>>,
  };
}

export async function getActiveNormalizedDepartmentRoutingRows(
  hotelId: string,
): Promise<NormalizedProjectionRows> {
  const [departmentsResult, routingRulesResult] = await Promise.all([
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

  const firstError = departmentsResult.error || routingRulesResult.error;
  if (firstError) {
    throw new Error(
      `Normalized department/routing lookup failed: ${firstError.message}`,
    );
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
    departments,
    routingRules,
  };
}

export async function resolveNormalizedRoomConfigForRuntime(input: {
  hotelId: string;
  isSandbox: boolean;
  published: PublishedConfigForRuntime;
}): Promise<NormalizedRuntimeResult> {
  if (!input.isSandbox) {
    return buildSandboxNormalizedRoomRuntimeConfig({
      isSandbox: false,
      publishedRevisionId: input.published.revisionId,
      publishedChecksum: input.published.sourceChecksum,
      publishedConfig: input.published.config,
      projectionState: null,
    });
  }

  const cacheKey = `rooms:${input.hotelId}:${input.published.revisionId}:${input.published.sourceChecksum}`;
  const cached = await readNormalizedRuntimeCache(cacheKey);
  if (cached) return cached;

  const projectionState = await getNormalizedProjectionState(input.hotelId);

  if (!metadataActivatesRoomReads(projectionState)) {
    const result = buildSandboxNormalizedRoomRuntimeConfig({
      isSandbox: true,
      publishedRevisionId: input.published.revisionId,
      publishedChecksum: input.published.sourceChecksum,
      publishedConfig: input.published.config,
      projectionState,
    });
    await writeNormalizedRuntimeCache(input.hotelId, cacheKey, result);
    return result;
  }

  const rows = await getActiveNormalizedRoomRows(input.hotelId);

  const result = buildSandboxNormalizedRoomRuntimeConfig({
    isSandbox: true,
    publishedRevisionId: input.published.revisionId,
    publishedChecksum: input.published.sourceChecksum,
    publishedConfig: input.published.config,
    projectionState,
    rows,
  });
  await writeNormalizedRuntimeCache(input.hotelId, cacheKey, result);
  return result;
}

export async function resolveNormalizedDepartmentRoutingConfigForRuntime(input: {
  hotelId: string;
  hotelTimeZone: string;
  isSandbox: boolean;
  published: PublishedConfigForRuntime;
}): Promise<NormalizedRuntimeResult> {
  if (!input.isSandbox) {
    return buildSandboxNormalizedDepartmentRoutingRuntimeConfig({
      isSandbox: false,
      hotelTimeZone: input.hotelTimeZone,
      publishedRevisionId: input.published.revisionId,
      publishedChecksum: input.published.sourceChecksum,
      publishedConfig: input.published.config,
      projectionState: null,
    });
  }

  const cacheKey = `departments:${input.hotelId}:${input.published.revisionId}:${input.published.sourceChecksum}`;
  const cached = await readNormalizedRuntimeCache(cacheKey);
  if (cached) return cached;

  const projectionState = await getNormalizedProjectionState(input.hotelId);

  if (!metadataActivatesDepartmentRoutingReads(projectionState)) {
    const result = buildSandboxNormalizedDepartmentRoutingRuntimeConfig({
      isSandbox: true,
      hotelTimeZone: input.hotelTimeZone,
      publishedRevisionId: input.published.revisionId,
      publishedChecksum: input.published.sourceChecksum,
      publishedConfig: input.published.config,
      projectionState,
    });
    await writeNormalizedRuntimeCache(input.hotelId, cacheKey, result);
    return result;
  }

  const rows = await getActiveNormalizedDepartmentRoutingRows(input.hotelId);

  const result = buildSandboxNormalizedDepartmentRoutingRuntimeConfig({
    isSandbox: true,
    hotelTimeZone: input.hotelTimeZone,
    publishedRevisionId: input.published.revisionId,
    publishedChecksum: input.published.sourceChecksum,
    publishedConfig: input.published.config,
    projectionState,
    rows,
  });
  await writeNormalizedRuntimeCache(input.hotelId, cacheKey, result);
  return result;
}
