import "server-only";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type RuntimeCellEnvironment = "production" | "sandbox" | "demo";
export type RuntimeCellClass = "standard" | "heavy" | "dedicated";
export type RuntimeCellLifecycle = "active" | "draining" | "inactive";
export type RuntimeCellHealthState = "healthy" | "unverified" | "attention" | "critical" | "inactive";

export type RuntimeCellHotel = {
  hotelId: string;
  slug: string;
  publicSlug: string | null;
  name: string;
  active: boolean;
  generation: number;
  assignmentSource: "automatic" | "backfill" | "control_plane" | "rebalance";
  assignedAt: string;
  healthState: RuntimeCellHealthState;
  projectionStatus: string | null;
  certificationStatus: string | null;
  certificationHealth: string | null;
  materializedRuntimeReady: boolean;
  recentCriticalCount: number;
  recentErrorCount: number;
  recentWarningCount: number;
  lastEventAt: string | null;
};

export type RuntimeCellFleetCell = {
  id: string;
  cellKey: string;
  displayName: string;
  environmentScope: RuntimeCellEnvironment;
  cellClass: RuntimeCellClass;
  lifecycleState: RuntimeCellLifecycle;
  routingTargetKey: string;
  maxHotels: number;
  desiredMaxP95Ms: number;
  version: number;
  hotelCount: number;
  capacityRemaining: number;
  utilizationPercent: number;
  healthState: RuntimeCellHealthState;
  healthyCount: number;
  unverifiedCount: number;
  attentionCount: number;
  criticalCount: number;
  inactiveHotelCount: number;
  hotels: RuntimeCellHotel[];
};

export type RuntimeCellFleetSnapshot = {
  cells: RuntimeCellFleetCell[];
  hotelCount: number;
  assignedHotelCount: number;
  unassignedHotelCount: number;
  activeCellCount: number;
  healthyHotelCount: number;
  unverifiedHotelCount: number;
  attentionHotelCount: number;
  criticalHotelCount: number;
  generatedAt: string;
};

type CellRow = {
  id: string;
  cell_key: string;
  display_name: string;
  environment_scope: RuntimeCellEnvironment;
  cell_class: RuntimeCellClass;
  lifecycle_state: RuntimeCellLifecycle;
  routing_target_key: string;
  max_hotels: number;
  desired_max_p95_ms: number;
  version: number | string;
};

type AssignmentRow = {
  hotel_id: string;
  cell_id: string;
  generation: number | string;
  assignment_source: RuntimeCellHotel["assignmentSource"];
  assigned_at: string;
};

type HotelRow = {
  id: string;
  slug: string;
  public_slug: string | null;
  name: string;
  active: boolean;
};

type HealthRow = {
  hotel_id: string;
  cell_id: string;
  cell_key: string;
  hotel_active: boolean;
  health_state: RuntimeCellHealthState;
  projection_status: string | null;
  certification_status: string | null;
  certification_health: string | null;
  materialized_runtime_ready: boolean;
  recent_critical_count: number | string;
  recent_error_count: number | string;
  recent_warning_count: number | string;
  last_event_at: string | null;
};

type MoveRpcRow = {
  hotel_id: string;
  previous_cell_key: string;
  cell_key: string;
  generation: number | string;
};

type RuntimeCellRouteRow = {
  hotel_id: string;
  hotel_slug: string;
  public_slug: string | null;
  cell_id: string;
  cell_key: string;
  environment_scope: RuntimeCellEnvironment;
  cell_class: RuntimeCellClass;
  lifecycle_state: RuntimeCellLifecycle;
  routing_target_key: string;
  generation: number | string;
};

function normalizeUuid(value: unknown, code: string) {
  const id = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new Error(code);
  }
  return id;
}

function normalizeCellKey(value: unknown) {
  const cellKey = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(cellKey)) {
    throw new Error("RUNTIME_CELL_TARGET_INVALID");
  }
  return cellKey;
}

function normalizeReason(value: unknown) {
  const reason = String(value || "").trim();
  if (reason.length < 3 || reason.length > 1000) throw new Error("RUNTIME_CELL_REASON_INVALID");
  return reason;
}

function cellHealthState(hotels: RuntimeCellHotel[]): RuntimeCellHealthState {
  const activeHotels = hotels.filter((hotel) => hotel.active);
  if (!activeHotels.length) return "inactive";
  if (activeHotels.some((hotel) => hotel.healthState === "critical")) return "critical";
  if (activeHotels.some((hotel) => hotel.healthState === "attention")) return "attention";
  if (activeHotels.some((hotel) => hotel.healthState === "unverified")) return "unverified";
  return "healthy";
}

/**
 * Platform-wide fleet read. Runtime cells partition hotel tenants, but they do
 * not replace hotel identity, Factory publication, commercial entitlement, or
 * the materialized tenant runtime authority. Cell Health is a read-only
 * aggregation over existing Factory/runtime/system evidence; it persists no
 * competing health truth.
 */
export async function getRuntimeCellFleetSnapshot(): Promise<RuntimeCellFleetSnapshot> {
  const [cellsResult, assignmentsResult, hotelsResult, healthResult] = await Promise.all([
    supabaseAdmin
      .from("runtime_cells")
      .select("id,cell_key,display_name,environment_scope,cell_class,lifecycle_state,routing_target_key,max_hotels,desired_max_p95_ms,version")
      .order("environment_scope", { ascending: true })
      .order("cell_key", { ascending: true }),
    supabaseAdmin
      .from("hotel_runtime_cell_assignments")
      .select("hotel_id,cell_id,generation,assignment_source,assigned_at")
      .order("hotel_id", { ascending: true }),
    supabaseAdmin
      .from("hotels")
      .select("id,slug,public_slug,name,active")
      .order("slug", { ascending: true }),
    supabaseAdmin.rpc("get_runtime_cell_fleet_health_v1"),
  ]);

  const failure = [cellsResult, assignmentsResult, hotelsResult, healthResult].find((result) => result.error)?.error;
  if (failure) throw new Error(`RUNTIME_CELL_FLEET_UNAVAILABLE:${failure.message}`);

  const cellRows = (cellsResult.data || []) as CellRow[];
  const assignmentRows = (assignmentsResult.data || []) as AssignmentRow[];
  const hotelRows = (hotelsResult.data || []) as HotelRow[];
  const healthRows = (healthResult.data || []) as HealthRow[];
  const hotelsById = new Map(hotelRows.map((hotel) => [hotel.id, hotel]));
  const healthByHotelId = new Map(healthRows.map((health) => [health.hotel_id, health]));
  const assignmentsByCell = new Map<string, RuntimeCellHotel[]>();
  const assignedHotelIds = new Set<string>();

  for (const assignment of assignmentRows) {
    const hotel = hotelsById.get(assignment.hotel_id);
    if (!hotel) throw new Error(`RUNTIME_CELL_ORPHAN_ASSIGNMENT:${assignment.hotel_id}`);
    const health = healthByHotelId.get(hotel.id);
    if (!health || health.cell_id !== assignment.cell_id) {
      throw new Error(`RUNTIME_CELL_HEALTH_MISSING:${hotel.id}`);
    }
    assignedHotelIds.add(hotel.id);
    const entry: RuntimeCellHotel = {
      hotelId: hotel.id,
      slug: hotel.slug,
      publicSlug: hotel.public_slug,
      name: hotel.name,
      active: Boolean(hotel.active),
      generation: Number(assignment.generation),
      assignmentSource: assignment.assignment_source,
      assignedAt: assignment.assigned_at,
      healthState: health.health_state,
      projectionStatus: health.projection_status,
      certificationStatus: health.certification_status,
      certificationHealth: health.certification_health,
      materializedRuntimeReady: Boolean(health.materialized_runtime_ready),
      recentCriticalCount: Number(health.recent_critical_count),
      recentErrorCount: Number(health.recent_error_count),
      recentWarningCount: Number(health.recent_warning_count),
      lastEventAt: health.last_event_at,
    };
    assignmentsByCell.set(assignment.cell_id, [
      ...(assignmentsByCell.get(assignment.cell_id) || []),
      entry,
    ]);
  }

  const cells = cellRows.map((cell): RuntimeCellFleetCell => {
    const hotels = assignmentsByCell.get(cell.id) || [];
    const maxHotels = Number(cell.max_hotels);
    const hotelCount = hotels.length;
    return {
      id: cell.id,
      cellKey: cell.cell_key,
      displayName: cell.display_name,
      environmentScope: cell.environment_scope,
      cellClass: cell.cell_class,
      lifecycleState: cell.lifecycle_state,
      routingTargetKey: cell.routing_target_key,
      maxHotels,
      desiredMaxP95Ms: Number(cell.desired_max_p95_ms),
      version: Number(cell.version),
      hotelCount,
      capacityRemaining: Math.max(0, maxHotels - hotelCount),
      utilizationPercent: maxHotels > 0 ? Math.round((hotelCount / maxHotels) * 1000) / 10 : 100,
      healthState: cellHealthState(hotels),
      healthyCount: hotels.filter((hotel) => hotel.healthState === "healthy").length,
      unverifiedCount: hotels.filter((hotel) => hotel.healthState === "unverified").length,
      attentionCount: hotels.filter((hotel) => hotel.healthState === "attention").length,
      criticalCount: hotels.filter((hotel) => hotel.healthState === "critical").length,
      inactiveHotelCount: hotels.filter((hotel) => hotel.healthState === "inactive").length,
      hotels,
    };
  });

  const allHotels = cells.flatMap((cell) => cell.hotels);
  return {
    cells,
    hotelCount: hotelRows.length,
    assignedHotelCount: assignedHotelIds.size,
    unassignedHotelCount: hotelRows.length - assignedHotelIds.size,
    activeCellCount: cells.filter((cell) => cell.lifecycleState === "active").length,
    healthyHotelCount: allHotels.filter((hotel) => hotel.healthState === "healthy").length,
    unverifiedHotelCount: allHotels.filter((hotel) => hotel.healthState === "unverified").length,
    attentionHotelCount: allHotels.filter((hotel) => hotel.healthState === "attention").length,
    criticalHotelCount: allHotels.filter((hotel) => hotel.healthState === "critical").length,
    generatedAt: new Date().toISOString(),
  };
}

export async function moveHotelRuntimeCell(input: {
  authority: PlatformAdminAuthority;
  hotelId: unknown;
  targetCellKey: unknown;
  expectedGeneration: unknown;
  reason: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("RUNTIME_CELL_ADMIN_FORBIDDEN");
  }

  const hotelId = normalizeUuid(input.hotelId, "RUNTIME_CELL_HOTEL_ID_INVALID");
  const targetCellKey = normalizeCellKey(input.targetCellKey);
  const expectedGeneration = Number(input.expectedGeneration);
  if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 1) {
    throw new Error("RUNTIME_CELL_GENERATION_INVALID");
  }
  const reason = normalizeReason(input.reason);

  const { data, error } = await supabaseAdmin.rpc("move_hotel_runtime_cell_v1", {
    p_actor_admin_id: input.authority.adminId,
    p_hotel_id: hotelId,
    p_target_cell_key: targetCellKey,
    p_expected_generation: expectedGeneration,
    p_reason: reason,
  });
  if (error) throw new Error(`RUNTIME_CELL_MOVE_FAILED:${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as MoveRpcRow | null;
  if (!row || row.hotel_id !== hotelId) throw new Error("RUNTIME_CELL_MOVE_RESULT_MISMATCH");

  return {
    hotelId: row.hotel_id,
    previousCellKey: row.previous_cell_key,
    cellKey: row.cell_key,
    generation: Number(row.generation),
  };
}

/**
 * Stable tenant-router seam for the next phase. It deliberately fails closed
 * when a hotel is not assigned to an active cell. Guest hot paths are not
 * switched to this seam until the cell foundation is proven on Sandbox.
 */
export async function resolveActiveRuntimeCellByHotelSlug(slug: string) {
  const normalizedSlug = String(slug || "").trim().toLowerCase();
  if (!normalizedSlug) throw new Error("RUNTIME_CELL_SLUG_REQUIRED");

  const { data, error } = await supabaseAdmin.rpc("get_hotel_runtime_cell_v1", {
    p_slug: normalizedSlug,
  });
  if (error) throw new Error(`RUNTIME_CELL_ROUTE_LOOKUP_FAILED:${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as RuntimeCellRouteRow | null;
  if (!row || row.lifecycle_state !== "active") {
    throw new Error("RUNTIME_CELL_ROUTE_UNAVAILABLE");
  }

  return {
    hotelId: row.hotel_id,
    hotelSlug: row.hotel_slug,
    publicSlug: row.public_slug,
    cellId: row.cell_id,
    cellKey: row.cell_key,
    environmentScope: row.environment_scope,
    cellClass: row.cell_class,
    lifecycleState: row.lifecycle_state,
    routingTargetKey: row.routing_target_key,
    generation: Number(row.generation),
  };
}
