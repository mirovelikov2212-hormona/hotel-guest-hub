import type { HotelConfig } from "../types";

export type NormalizedProjectionState = {
  projected_revision_id?: string | null;
  projected_source_checksum?: string | null;
  projection_status?: string | null;
  rooms_count?: number | null;
  active_rooms_count?: number | null;
  departments_count?: number | null;
  active_departments_count?: number | null;
  routing_rules_count?: number | null;
  active_routing_rules_count?: number | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  metadata_json?: Record<string, unknown> | null;
};

export type NormalizedProjectionRows = {
  rooms?: Array<Record<string, unknown>>;
  departments?: Array<Record<string, unknown>>;
  routingRules?: Array<Record<string, unknown>>;
};

export type NormalizedRuntimeResult =
  | {
      ok: true;
      source: "normalized";
      reason: null;
      config: HotelConfig;
    }
  | {
      ok: false;
      source: "published_snapshot";
      reason: string;
      config: HotelConfig;
    };

export function buildSandboxNormalizedRoomRuntimeConfig(input: {
  isSandbox: boolean;
  publishedRevisionId: string;
  publishedChecksum: string;
  publishedConfig: HotelConfig;
  projectionState: NormalizedProjectionState | null;
  rows?: NormalizedProjectionRows | null;
}): NormalizedRuntimeResult;

export function buildSandboxNormalizedDepartmentRoutingRuntimeConfig(input: {
  isSandbox: boolean;
  hotelTimeZone: string;
  publishedRevisionId: string;
  publishedChecksum: string;
  publishedConfig: HotelConfig;
  projectionState: NormalizedProjectionState | null;
  rows?: NormalizedProjectionRows | null;
}): NormalizedRuntimeResult;
