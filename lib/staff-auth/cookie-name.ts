import type { StaffRole } from "@/lib/staff/role-code";

export type { StaffRole } from "@/lib/staff/role-code";

function sanitizeSegment(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
}

export function getStaffSessionCookieName(hotelSlug: string, role: StaffRole) {
  const hotel = sanitizeSegment(hotelSlug);
  const safeRole = sanitizeSegment(role);
  return `stayhub_staff_session__${hotel}__${safeRole}`;
}
