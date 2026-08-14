import type { HotelConfig } from "../types";

export type GuestRequestRelationalAuthority = {
  revisionId: string;
  sourceChecksum: string;
  roomIdByNumber: Record<string, string>;
  departmentIdByCode: Record<string, string>;
  routingDepartmentIdByRequestType: Record<string, string>;
};

export type GuestRequestRelationalIdsResult =
  | {
      active: false;
      ok: true;
      roomId: null;
      departmentId: null;
      revisionId: null;
      sourceChecksum: null;
    }
  | {
      active: true;
      ok: true;
      roomId: string;
      departmentId: string;
      revisionId: string;
      sourceChecksum: string;
    }
  | {
      active: true;
      ok: false;
      code:
        | "NORMALIZED_ROOM_ID_MISSING"
        | "NORMALIZED_DEPARTMENT_ID_MISSING"
        | "NORMALIZED_ROUTING_DEPARTMENT_ID_MISMATCH";
    };

export function attachGuestRequestRelationalAuthority(
  config: HotelConfig,
  authority: GuestRequestRelationalAuthority,
): HotelConfig;

export function getGuestRequestRelationalAuthority(
  config: HotelConfig | null | undefined,
): GuestRequestRelationalAuthority | null;

export function resolveGuestRequestRelationalIds(
  config: HotelConfig | null | undefined,
  input: {
    roomNumber: unknown;
    departmentCode: unknown;
    requestType: unknown;
  },
): GuestRequestRelationalIdsResult;
