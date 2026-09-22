import type { DepartmentKey, HotelConfig } from "../types";

export const DEFAULT_HOTEL_TIME_ZONE: string;

type DepartmentScheduleConfig = Pick<
  HotelConfig,
  | "departmentRoutingRuntimeActivated"
  | "departmentHours"
  | "departmentSchedules"
  | "hotelTimezone"
>;

type DepartmentCoverageInput = {
  hotelConfig?: DepartmentScheduleConfig | null;
  department: DepartmentKey | string;
  date?: Date;
};

export function getHotelLocalMinutes(date?: Date, timeZone?: string): number;

export function isDepartmentWorkingHours(
  date?: Date,
  timeZone?: string,
  hours?: { open?: string | null; close?: string | null } | null,
): boolean;

export function isReceptionBackupHours(
  date?: Date,
  timeZone?: string,
  hours?: { open?: string | null; close?: string | null } | null,
): boolean;

export function hasConfiguredDepartmentScheduleForConfig(
  input: DepartmentCoverageInput,
): boolean;

export function isDepartmentWorkingHoursForConfig(
  input: DepartmentCoverageInput,
): boolean;

export function resolveDepartmentCoverageForConfig(
  input: DepartmentCoverageInput,
): {
  configured: boolean;
  workingHoursKnown: boolean;
  working: boolean;
};
