import type { DepartmentKey, HotelConfig } from "../types";

export const DEFAULT_HOTEL_TIME_ZONE: string;

export function getHotelLocalMinutes(date?: Date, timeZone?: string): number;

export function isDepartmentWorkingHours(
  date?: Date,
  timeZone?: string,
): boolean;

export function isReceptionBackupHours(
  date?: Date,
  timeZone?: string,
): boolean;

export function isDepartmentWorkingHoursForConfig(input: {
  hotelConfig?: Pick<
    HotelConfig,
    | "departmentRoutingRuntimeActivated"
    | "departmentHours"
    | "hotelTimezone"
  > | null;
  department: DepartmentKey | string;
  date?: Date;
}): boolean;
