import type {
  StaffDepartment,
  StaffRequest,
  StaffRequestStatus,
  StaffServiceTime,
} from "@/lib/staff/types";
import {
  isActiveStaffStatus,
  isOutsideDepartmentWorkingHours,
} from "@/lib/staff/operations-hours";

export type StaffOperationalRole =
  | "reception"
  | "housekeeping"
  | "maintenance"
  | "manager";

export type StaffRequestLike = {
  department?: StaffDepartment | string | null;
  status?: StaffRequestStatus | string | null;
  serviceTime?: StaffServiceTime | string | null;
  requiresBilling?: boolean | null;
  price?: string | null;
  notifyDepartments?: Array<string | StaffDepartment> | null;
  billingStatus?: string | null;
};

export function normalizeDepartment(value?: string | StaffDepartment | null) {
  const department = String(value || "").trim().toLowerCase();

  if (
    department === "reception" ||
    department === "housekeeping" ||
    department === "maintenance" ||
    department === "restaurant"
  ) {
    return department as StaffDepartment;
  }

  return undefined;
}

export function isDepartmentBackedUpByReception(
  request: StaffRequestLike,
  now = new Date(),
) {
  const department = normalizeDepartment(request.department);

  if (!isActiveStaffStatus(request.status)) return false;
  if (department !== "housekeeping" && department !== "maintenance") return false;

  return isOutsideDepartmentWorkingHours(now);
}

export function getEffectiveOperationalDepartment(
  request: StaffRequestLike,
  now = new Date(),
) {
  const originalDepartment = normalizeDepartment(request.department) ?? "reception";

  if (isDepartmentBackedUpByReception(request, now)) {
    return "reception" as StaffDepartment;
  }

  return originalDepartment;
}

export function isBillingRelevantRequest(request: StaffRequestLike) {
  if (request.requiresBilling) return true;
  if (String(request.price || "").trim()) return true;

  const notifyDepartments = Array.isArray(request.notifyDepartments)
    ? request.notifyDepartments
    : [];

  return notifyDepartments.some(
    (department) => String(department || "").trim().toLowerCase() === "reception",
  );
}

export function isBillingCharged(request: StaffRequestLike) {
  return String(request.billingStatus || "").trim().toLowerCase() === "charged";
}

/**
 * Visibility and processing are deliberately separate:
 * - Manager sees everything and never processes.
 * - Reception sees everything.
 * - Housekeeping/Maintenance see only their own operational board while their department is open.
 */
export function canRoleViewRequest(
  role: StaffOperationalRole,
  request: StaffRequestLike,
  now = new Date(),
) {
  if (role === "manager" || role === "reception") return true;

  const originalDepartment = normalizeDepartment(request.department);
  if (originalDepartment !== role) return false;

  return !isDepartmentBackedUpByReception(request, now);
}

/**
 * Operational status: Start / Done / Return.
 * Billing does not block operational handling. Billing is a separate reception action.
 */
export function canRoleProcessOperationalRequest(
  role: StaffOperationalRole,
  request: StaffRequestLike,
  now = new Date(),
) {
  if (role === "manager") return false;
  if (!isActiveStaffStatus(request.status)) return false;

  const originalDepartment = normalizeDepartment(request.department) ?? "reception";

  if (role === "reception") {
    return originalDepartment === "reception" || isDepartmentBackedUpByReception(request, now);
  }

  if (role === "housekeeping" || role === "maintenance") {
    return originalDepartment === role && !isDepartmentBackedUpByReception(request, now);
  }

  return false;
}

export function canRoleChargeRequest(role: StaffOperationalRole, request: StaffRequestLike) {
  return role === "reception" && isBillingRelevantRequest(request) && !isBillingCharged(request);
}

export function getReceptionRequestMode(
  request: StaffRequest,
  now = new Date(),
): "operational" | "billing" | "monitoring" {
  if (canRoleProcessOperationalRequest("reception", request, now)) return "operational";
  if (canRoleChargeRequest("reception", request)) return "billing";
  return "monitoring";
}
