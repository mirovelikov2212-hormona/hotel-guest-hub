export type StaffFeedRole = "reception" | "housekeeping" | "maintenance" | "manager";

export type StaffFeedState = {
  requestsVersion: number;
  surveysVersion: number;
  updatedAt: string | null;
};

export async function fetchStaffFeedState(input: {
  hotelSlug: string;
  role: StaffFeedRole;
}): Promise<StaffFeedState> {
  const params = new URLSearchParams({
    hotelSlug: input.hotelSlug,
    role: input.role,
    _: String(Date.now()),
  });

  const response = await fetch(`/api/staff/feed-state?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch staff feed state: ${response.status}`);
  }

  const payload = (await response.json()) as {
    ok?: boolean;
    requestsVersion?: unknown;
    surveysVersion?: unknown;
    updatedAt?: unknown;
  };

  if (!payload?.ok) {
    throw new Error("Invalid staff feed state response");
  }

  const requestsVersion = Number(payload.requestsVersion ?? 0);
  const surveysVersion = Number(payload.surveysVersion ?? 0);

  return {
    requestsVersion: Number.isFinite(requestsVersion) ? requestsVersion : 0,
    surveysVersion: Number.isFinite(surveysVersion) ? surveysVersion : 0,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
  };
}
