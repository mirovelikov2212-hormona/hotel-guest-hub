import { getCanonicalStaffRequestDepartment } from "@/lib/staff/request-contract.mjs";
import type { StaffDepartment, StaffRequestType } from "@/lib/staff/types";

export function getDepartmentForRequestType(
  requestType: StaffRequestType
): StaffDepartment {
  return getCanonicalStaffRequestDepartment(requestType) ?? "reception";
}