import type { HotelConfig } from "../types";

export const DEPARTMENT_COVERAGE_FALLBACK_EVENT: string;
export const DEPARTMENT_COVERAGE_RESUMED_EVENT: string;

export type DepartmentCoverageRequestRow = {
  id?: string;
  created_at?: string;
  request_type?: string;
  metadata_json?: Record<string, unknown> | null;
};

export type DepartmentCoverageTransitionDecision = {
  ok: boolean;
  code?: string;
  action: "skip" | "none" | "record_fallback_without_push" | "start_fallback" | "resume_primary";
  reason?: string;
  primaryDepartment?: string;
  afterHoursDepartment?: string | null;
  effectiveDepartment?: string;
  fallbackRequired?: boolean;
  coverage?: {
    configured: boolean;
    workingHoursKnown: boolean;
    working: boolean;
  };
  createdCoverage?: {
    configured: boolean;
    workingHoursKnown: boolean;
    working: boolean;
  };
};

export function resolveRequestCoverageRouting(input: {
  request: DepartmentCoverageRequestRow;
  hotelConfig: Pick<HotelConfig, "hotelTimezone" | "departmentHours" | "departmentSchedules" | "departmentRoutingRuntimeActivated" | "requestDefs">;
  now?: Date;
  createdAt?: Date;
}): DepartmentCoverageTransitionDecision;

export function decideRequestCoverageTransition(input: {
  request: DepartmentCoverageRequestRow;
  hotelConfig: Pick<HotelConfig, "hotelTimezone" | "departmentHours" | "departmentSchedules" | "departmentRoutingRuntimeActivated" | "requestDefs">;
  now?: Date;
  createdAt?: Date;
  lastEventType?: string | null;
}): DepartmentCoverageTransitionDecision;
