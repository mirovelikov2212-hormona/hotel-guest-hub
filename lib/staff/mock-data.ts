import type {
  StaffDepartment,
  StaffRequest,
  StaffRequestStatus,
} from "./types";

export const mockStaffRequests: StaffRequest[] = [
  {
    id: "req-1",
    room: "104",
    department: "housekeeping",
    type: "towels",
    typeLabel: "Towels",
    status: "new",
    serviceTime: "now",
    createdAt: "10:14",
  },
  {
    id: "req-2",
    room: "112",
    department: "housekeeping",
    type: "toilet_paper",
    typeLabel: "Toilet paper",
    status: "new",
    serviceTime: "now",
    createdAt: "10:22",
  },
  {
    id: "req-3",
    room: "118",
    department: "housekeeping",
    type: "extra_pillow",
    typeLabel: "Extra pillow",
    status: "in_progress",
    serviceTime: "tomorrow",
    createdAt: "10:05",
    note: "2 pillows requested",
  },
  {
    id: "req-4",
    room: "121",
    department: "housekeeping",
    type: "slippers",
    typeLabel: "Slippers",
    status: "completed",
    serviceTime: "now",
    createdAt: "09:45",
  },
  {
    id: "req-5",
    room: "126",
    department: "housekeeping",
    type: "bathrobe",
    typeLabel: "Bathrobe",
    status: "returned",
    serviceTime: "now",
    createdAt: "09:52",
  },
  {
    id: "req-6",
    room: "130",
    department: "housekeeping",
    type: "baby_cot",
    typeLabel: "Baby cot",
    status: "new",
    serviceTime: "tomorrow",
    createdAt: "10:31",
  },
  {
    id: "req-7",
    room: "203",
    department: "maintenance",
    type: "air_conditioning",
    typeLabel: "Air conditioning problem",
    status: "new",
    serviceTime: "now",
    createdAt: "10:18",
    note: "AC is not cooling properly.",
  },
  {
    id: "req-8",
    room: "214",
    department: "maintenance",
    type: "light_not_working",
    typeLabel: "Light not working",
    status: "in_progress",
    serviceTime: "now",
    createdAt: "10:02",
  },
  {
    id: "req-9",
    room: "219",
    department: "maintenance",
    type: "no_hot_water",
    typeLabel: "No hot water",
    status: "new",
    serviceTime: "now",
    createdAt: "10:27",
  },
  {
    id: "req-10",
    room: "225",
    department: "maintenance",
    type: "tv_issue",
    typeLabel: "TV issue",
    status: "completed",
    serviceTime: "tomorrow",
    createdAt: "09:35",
  },
  {
    id: "req-11",
    room: "228",
    department: "maintenance",
    type: "bathroom_issue",
    typeLabel: "Bathroom issue",
    status: "returned",
    serviceTime: "now",
    createdAt: "09:58",
    note: "Needs external technician check.",
  },
  {
    id: "req-12",
    room: "231",
    department: "maintenance",
    type: "other_technical_issue",
    typeLabel: "Other technical issue",
    status: "new",
    serviceTime: "tomorrow",
    createdAt: "10:33",
    note: "Balcony door handle is loose.",
  },
  {
    id: "req-13",
    room: "305",
    department: "reception",
    type: "taxi",
    typeLabel: "Taxi",
    status: "new",
    serviceTime: "now",
    createdAt: "10:29",
  },
  {
    id: "req-14",
    room: "318",
    department: "reception",
    type: "late_checkout",
    typeLabel: "Late checkout request",
    status: "new",
    serviceTime: "tomorrow",
    createdAt: "10:37",
  },
  {
    id: "req-15",
    room: "214",
    department: "restaurant",
    type: "restaurant_reservation",
    typeLabel: "Restaurant reservation",
    status: "completed",
    serviceTime: "tomorrow",
    createdAt: "09:42",
  },
];

export function sortStaffRequests(requests: StaffRequest[]) {
  const order: Record<StaffRequestStatus, number> = {
    new: 0,
    in_progress: 1,
    returned: 2,
    completed: 3,
  };

  return [...requests].sort((a, b) => {
    if (order[a.status] !== order[b.status]) {
      return order[a.status] - order[b.status];
    }

    return a.room.localeCompare(b.room, undefined, { numeric: true });
  });
}

export function getRequestsByDepartment(
  requests: StaffRequest[],
  department: StaffDepartment
) {
  return requests.filter((request) => request.department === department);
}

export function getRequestSummary(requests: StaffRequest[]) {
  return {
    total: requests.length,
    newCount: requests.filter((r) => r.status === "new").length,
    inProgressCount: requests.filter((r) => r.status === "in_progress").length,
    completedCount: requests.filter((r) => r.status === "completed").length,
    returnedCount: requests.filter((r) => r.status === "returned").length,
  };
}