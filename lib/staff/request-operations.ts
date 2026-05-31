import type {
  StaffDepartment,
  StaffRequest,
  StaffRequestStatus,
  StaffServiceTime,
} from "@/lib/staff/types";
import {
  isActiveStaffStatus,
  isAfterOperationsHours,
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

export function isOperationalDepartmentRoutedToReception(
  request: StaffRequestLike,
  now = new Date(),
) {
  const department = normalizeDepartment(request.department);
  const serviceTime = String(request.serviceTime || "now").trim().toLowerCase();

  if (serviceTime === "tomorrow") return false;
  if (!isActiveStaffStatus(request.status)) return false;
  if (department !== "housekeeping" && department !== "maintenance") return false;

  return isAfterOperationsHours(now);
}

export function getEffectiveOperationalDepartment(
  request: StaffRequestLike,
  now = new Date(),
) {
  const originalDepartment = normalizeDepartment(request.department) ?? "reception";

  if (isOperationalDepartmentRoutedToReception(request, now)) {
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

export function canRoleViewRequest(
  role: StaffOperationalRole,
  request: StaffRequestLike,
  now = new Date(),
) {
  if (role === "manager") return true;
  if (role === "reception") return true;

  const department = normalizeDepartment(request.department);
  if (role !== department) return false;

  return !isOperationalDepartmentRoutedToReception(request, now);
}

export function canRoleProcessOperationalRequest(
  role: StaffOperationalRole,
  request: StaffRequestLike,
  now = new Date(),
) {
  if (role === "manager") return false;

  const originalDepartment = normalizeDepartment(request.department);
  const effectiveDepartment = getEffectiveOperationalDepartment(request, now);

  if (role === "reception") {
    return effectiveDepartment === "reception";
  }

  if (role === "housekeeping" || role === "maintenance") {
    return originalDepartment === role && effectiveDepartment === role;
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
  if (canRoleProcessOperationalRequest("reception", request, now)) {
    return "operational";
  }

  if (canRoleChargeRequest("reception", request)) {
    return "billing";
  }

  return "monitoring";
}
