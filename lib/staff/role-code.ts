export type StaffRole = string;

export const STAFF_MANAGER_ROLE = "manager";

const STAFF_ROLE_CODE_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;
const RESERVED_NON_ROLE_SEGMENTS = new Set(["pin"]);

export function normalizeStaffRoleCode(value: unknown): StaffRole | null {
  const role = String(value ?? "").trim().toLowerCase();
  if (!STAFF_ROLE_CODE_PATTERN.test(role)) return null;
  if (RESERVED_NON_ROLE_SEGMENTS.has(role)) return null;
  return role;
}

export function isStaffRoleCode(value: unknown): value is StaffRole {
  return normalizeStaffRoleCode(value) !== null;
}

export function isManagerStaffRole(value: unknown) {
  return normalizeStaffRoleCode(value) === STAFF_MANAGER_ROLE;
}

export function staffRoleDisplayName(value: unknown) {
  const role = normalizeStaffRoleCode(value);
  if (!role) return "Staff";
  if (role === STAFF_MANAGER_ROLE) return "Manager";

  return role
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
