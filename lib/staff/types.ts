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

export type StaffRequestType =
  | "towels"
  | "toilet_paper"
  | "extra_pillow"
  | "extra_blanket"
  | "bathrobe"
  | "slippers"
  | "baby_cot"
  | "iron"
  | "minibar"
  | "laundry"
  | "other_housekeeping"
  | "air_conditioning"
  | "light_not_working"
  | "no_hot_water"
  | "tv_issue"
  | "bathroom_issue"
  | "door_lock_issue"
  | "wifi_issue"
  | "power_outlet_issue"
  | "safe_issue"
  | "balcony_door_issue"
  | "minibar_not_cooling"
  | "other_technical_issue"
  | "taxi"
  | "late_checkout"
  | "wake_up_call"
  | "information"
  | "information_request"
  | "reservation_help"
  | "other_reception"
  | "restaurant_reservation"
  | "luggage_help"
  | "massage_booking";

export type StaffBillingStatus = "pending" | "charged" | "waived" | "cancelled";

export type StaffRequest = {
  id: string;
  room: string;
  department: StaffDepartment;
  type: StaffRequestType;
  typeLabel: string;
  status: StaffRequestStatus;
  serviceTime: StaffServiceTime;
  createdAt: string;
  createdAtIso: string;
  createdDateKey: string;
  note?: string;
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