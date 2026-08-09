import type { CanonicalStaffRequestType } from "@/lib/staff/request-contract.mjs";

export type StaffDepartment =
  | "housekeeping"
  | "maintenance"
  | "reception"
  | "restaurant";

export type StaffRequestStatus =
  | "new"
  | "in_progress"
  | "completed"
  | "returned";

export type StaffServiceTime = "now" | "today" | "tomorrow";

export type StaffRequestType = CanonicalStaffRequestType;

export type StaffBillingStatus = "pending" | "charged" | "waived" | "cancelled";

export type StaffRequest = {
  id: string;
  room: string;
  department: StaffDepartment;
  type: StaffRequestType;
  typeLabel: string;
  typeLabelOriginal?: string | null;
  typeLabelBg?: string | null;
  typeLabelEn?: string | null;
  typeLabelDe?: string | null;
  status: StaffRequestStatus;
  serviceTime: StaffServiceTime;
  createdAt: string;
  createdAtIso: string;
  createdDateKey: string;
  note?: string;
  noteOriginal?: string | null;
  noteBg?: string | null;
  noteEn?: string | null;
  noteDe?: string | null;
  requiresBilling?: boolean;
  price?: string | null;
  currency?: string | null;
  billingStatus?: StaffBillingStatus | null;
  billingChargedAt?: string | null;
  billingChargedByRole?: string | null;
  billingWaivedAt?: string | null;
  billingWaivedByRole?: string | null;
  billingCancelledAt?: string | null;
  billingCancelledByRole?: string | null;
  billingUpdatedAt?: string | null;
  billingUpdatedByRole?: string | null;
  sourceRequestDef?: string | null;
  notifyDepartments?: string[];
  guestLanguage?: string | null;
  isTest?: boolean;
  testExpiresAt?: string | null;
};

export const staffDepartmentLabels: Record<StaffDepartment, string> = {
  housekeeping: "Housekeeping",
  maintenance: "Maintenance",
  reception: "Reception",
  restaurant: "Restaurant",
};

export const staffDepartmentClasses: Record<StaffDepartment, string> = {
  housekeeping: "border-violet-400/30 bg-violet-400/15 text-violet-200",
  maintenance: "border-sky-400/30 bg-sky-400/15 text-sky-200",
  reception: "border-amber-400/30 bg-amber-400/15 text-amber-200",
  restaurant: "border-emerald-400/30 bg-emerald-400/15 text-emerald-200",
};

export const staffStatusLabels: Record<StaffRequestStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  completed: "Completed",
  returned: "Returned",
};

export const staffStatusClasses: Record<StaffRequestStatus, string> = {
  new: "border-amber-400/30 bg-amber-400/15 text-amber-200",
  in_progress: "border-sky-400/30 bg-sky-400/15 text-sky-200",
  completed: "border-emerald-400/30 bg-emerald-400/15 text-emerald-200",
  returned: "border-rose-400/30 bg-rose-400/15 text-rose-200",
};

export const staffServiceTimeLabels: Record<StaffServiceTime, string> = {
  now: "Now",
  today: "Today",
  tomorrow: "Tomorrow",
};