import type { HotelConfig } from "../types";

export type HotelConfigProjectionRoom = {
  room_number: string;
  floor: string | null;
  building: string | null;
  room_type: string | null;
  active: boolean;
};

export type HotelConfigProjectionDepartment = {
  code: string;
  name: string;
  whatsapp_number: string | null;
  email: string | null;
  opens_at: string | null;
  closes_at: string | null;
  is_24h: boolean;
  active: boolean;
};

export type HotelConfigProjectionRoutingRule = {
  request_type: string;
  department_code: string;
  after_hours_department_code: string | null;
  priority_default: "normal";
  auto_assign_mode: "none";
  active: boolean;
};

export type HotelConfigProjection = {
  schema_version: "m10.2";
  rooms: HotelConfigProjectionRoom[];
  departments: HotelConfigProjectionDepartment[];
  routing_rules: HotelConfigProjectionRoutingRule[];
};

export type HotelConfigProjectionResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  projection: HotelConfigProjection | null;
  counts?: {
    rooms: number;
    activeRooms: number;
    departments: number;
    activeDepartments: number;
    routingRules: number;
    activeRoutingRules: number;
  };
};

export function buildHotelConfigProjection(
  config: HotelConfig | Record<string, unknown> | null | undefined,
): HotelConfigProjectionResult;

export function resolveProjectionRuntimeRoute(
  definition: Record<string, unknown>,
): HotelConfigProjectionRoutingRule | null;
