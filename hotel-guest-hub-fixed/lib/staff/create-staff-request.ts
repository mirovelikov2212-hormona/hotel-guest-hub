import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import type {
  StaffRequest,
  StaffRequestType,
  StaffServiceTime,
} from "@/lib/staff/types";

type CreateStaffRequestInput = {
  room: string;
  type: StaffRequestType;
  typeLabel: string;
  serviceTime: StaffServiceTime;
  note?: string;
};

export function createStaffRequest(input: CreateStaffRequestInput): StaffRequest {
  const created = new Date();

  return {
    id: `req-${crypto.randomUUID()}`,
    room: input.room,
    department: getDepartmentForRequestType(input.type),
    type: input.type,
    typeLabel: input.typeLabel,
    status: "new",
    serviceTime: input.serviceTime,
    createdAt: created.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    createdAtIso: created.toISOString(),
    createdDateKey: created.toLocaleDateString("sv-SE"),
    note: input.note,
  };
}
