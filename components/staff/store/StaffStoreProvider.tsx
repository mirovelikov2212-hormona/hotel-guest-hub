"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { fetchStaffFeedState } from "@/lib/staff/staff-feed-state-client";
import type {
  StaffBillingStatus,
  StaffDepartment,
  StaffRequest,
  StaffRequestStatus,
  StaffRequestType,
  StaffServiceTime,
} from "@/lib/staff/types";

type StaffRole = "reception" | "housekeeping" | "maintenance" | "manager";

const STAFF_REQUEST_VISIBLE_POLL_MS = 10_000;
const STAFF_REQUEST_HIDDEN_POLL_MS = 60_000;

type AddRequestInput = {
  room: string;
  type: StaffRequestType;
  typeLabel: string;
  serviceTime: StaffServiceTime;
  note?: string;
};

type StaffStoreContextValue = {
  requests: StaffRequest[];
  hotelId?: string;
  hotelSlug?: string;
  updateRequestStatus: (id: string, status: StaffRequestStatus) => Promise<void>;
  setRequestBillingStatus: (id: string, billingStatus: StaffBillingStatus) => Promise<void>;
  chargeRequest: (id: string) => Promise<void>;
  addRequest: (input: AddRequestInput) => Promise<void>;
  getRequestsByDepartment: (department: StaffDepartment) => StaffRequest[];
  getOperationalRequestsByDepartment: (
    department: StaffDepartment
  ) => StaffRequest[];
  getAllRequests: () => StaffRequest[];
  getOperationalAllRequests: () => StaffRequest[];
  resetRequests: () => Promise<void>;
};

const StaffStoreContext = createContext<StaffStoreContextValue | null>(null);

function clearLegacyStaffCaches(activeKey?: string) {
  if (typeof window === "undefined") return;

  try {
    Object.keys(window.sessionStorage)
      .filter((key) => key.startsWith("stayhub_staff_cache:") && key !== activeKey)
      .forEach((key) => window.sessionStorage.removeItem(key));

    if (activeKey) {
      window.sessionStorage.removeItem(activeKey);
    }
  } catch (error) {
    console.error("clearLegacyStaffCaches failed", error);
  }
}

function isOperationalRequest(request: StaffRequest) {
  return (
    request.status === "new" ||
    request.status === "in_progress" ||
    request.status === "returned"
  );
}

function getRoleFromPath(pathname: string | null): StaffRole | undefined {
  if (!pathname) return undefined;

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "staff") return undefined;

  const role = parts[2]?.toLowerCase();
  if (
    role === "reception" ||
    role === "housekeeping" ||
    role === "maintenance" ||
    role === "manager"
  ) {
    return role;
  }

  return undefined;
}

let staffReauthRedirectStarted = false;

function redirectToStaffReauth(hotelSlug: string, role: StaffRole) {
  if (typeof window === "undefined" || staffReauthRedirectStarted) return;

  const normalizedHotelSlug = String(hotelSlug || "").trim().toLowerCase();
  if (!normalizedHotelSlug) return;

  const nextPath = `/staff/${normalizedHotelSlug}/${role}`;
  const pinPath =
    `/staff/${normalizedHotelSlug}/pin?role=${role}` +
    `&next=${encodeURIComponent(nextPath)}`;

  staffReauthRedirectStarted = true;
  window.location.replace(pinPath);
}

function enforceStaffResponseAuth(
  response: Response,
  hotelSlug: string,
  role: StaffRole,
) {
  if (response.status !== 401 && response.status !== 403) return;

  redirectToStaffReauth(hotelSlug, role);
  throw new Error(`STAFF_REAUTH_REQUIRED:${response.status}`);
}

function extractRequests(payload: unknown): StaffRequest[] {
  if (Array.isArray(payload)) {
    return payload as StaffRequest[];
  }

  if (payload && typeof payload === "object") {
    const record = payload as {
      requests?: unknown;
      data?: unknown;
      items?: unknown;
    };

    if (Array.isArray(record.requests)) return record.requests as StaffRequest[];
    if (Array.isArray(record.data)) return record.data as StaffRequest[];
    if (Array.isArray(record.items)) return record.items as StaffRequest[];
  }

  return [];
}

async function fetchStaffRequests(input: {
  hotelSlug: string;
  role: StaffRole;
}): Promise<StaffRequest[]> {
  const params = new URLSearchParams({
    hotelSlug: input.hotelSlug,
    role: input.role,
    _: String(Date.now()),
  });

  const response = await fetch(`/api/staff/requests?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  enforceStaffResponseAuth(response, input.hotelSlug, input.role);

  if (!response.ok) {
    throw new Error(`Failed to fetch staff requests: ${response.status}`);
  }

  const payload = await response.json();
  return extractRequests(payload);
}

async function updateStaffRequestStatus(input: {
  id: string;
  status: StaffRequestStatus;
  hotelSlug: string;
  role: StaffRole;
}) {
  const response = await fetch("/api/staff/request-status", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: input.id,
      requestId: input.id,
      status: input.status,
      hotelSlug: input.hotelSlug,
      role: input.role,
    }),
  });

  enforceStaffResponseAuth(response, input.hotelSlug, input.role);

  if (!response.ok) {
    throw new Error(`Failed to update request status: ${response.status}`);
  }
}

async function setStaffRequestBillingStatus(input: {
  id: string;
  hotelSlug: string;
  role: StaffRole;
  billingStatus: StaffBillingStatus;
}) {
  const response = await fetch("/api/staff/request-billing", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: input.id,
      requestId: input.id,
      hotelSlug: input.hotelSlug,
      role: input.role,
      billingStatus: input.billingStatus,
    }),
  });

  enforceStaffResponseAuth(response, input.hotelSlug, input.role);

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error
      ? String(payload.error)
      : `Failed to charge request: ${response.status}`;
    throw new Error(message);
  }
}

async function createStaffRequest(input: AddRequestInput & {
  hotelId?: string;
  hotelSlug?: string;
}) {
  const response = await fetch("/api/guest/request-create", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to create staff request: ${response.status}`);
  }
}

export function StaffStoreProvider({
  children,
  hotelSlug,
  hotelId,
}: {
  children: ReactNode;
  hotelSlug?: string;
  hotelId?: string;
}) {
  const pathname = usePathname();
  const currentRole = useMemo(() => getRoleFromPath(pathname), [pathname]);

  const normalizedHotelSlug = useMemo(
    () => String(hotelSlug ?? "").trim().toLowerCase() || undefined,
    [hotelSlug]
  );

  const normalizedHotelId = useMemo(
    () => String(hotelId ?? "").trim() || undefined,
    [hotelId]
  );

  const shouldLoadStaffData = Boolean(normalizedHotelSlug && currentRole);

  const staffCacheKey = useMemo(
    () =>
      normalizedHotelSlug && currentRole
        ? `stayhub_staff_cache:${normalizedHotelSlug}:${currentRole}`
        : undefined,
    [currentRole, normalizedHotelSlug]
  );

  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [isReady, setIsReady] = useState(false);
  const requestFeedVersionRef = useRef<number | null>(null);

  useEffect(() => {
    clearLegacyStaffCaches(staffCacheKey);
  }, [staffCacheKey]);

  const loadRequests = useCallback(async () => {
    if (!normalizedHotelSlug || !currentRole) {
      setRequests([]);
      setIsReady(true);
      return;
    }

    try {
      const data = await fetchStaffRequests({
        hotelSlug: normalizedHotelSlug,
        role: currentRole,
      });

      setRequests(data);
    } catch (error) {
      console.error("Failed to load staff requests from API", error);
    } finally {
      setIsReady(true);
    }
  }, [currentRole, normalizedHotelSlug]);

  useEffect(() => {
    if (!shouldLoadStaffData) {
      setRequests([]);
      setIsReady(true);
      requestFeedVersionRef.current = null;
      return;
    }

    if (!normalizedHotelSlug || !currentRole) return;

    let cancelled = false;
    let timer: number | undefined;
    let inFlight = false;

    const getPollInterval = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden"
        ? STAFF_REQUEST_HIDDEN_POLL_MS
        : STAFF_REQUEST_VISIBLE_POLL_MS;

    const refreshIfChanged = async (force = false) => {
      if (cancelled || inFlight) return;
      inFlight = true;

      try {
        const feedState = await fetchStaffFeedState({
          hotelSlug: normalizedHotelSlug,
          role: currentRole,
        });
        const changed =
          requestFeedVersionRef.current === null ||
          requestFeedVersionRef.current !== feedState.requestsVersion;

        if (force || changed) {
          await loadRequests();
        }
        requestFeedVersionRef.current = feedState.requestsVersion;
      } catch (error) {
        console.error("staff feed-state refresh failed; falling back to full request refresh", error);
        await loadRequests();
      } finally {
        inFlight = false;
      }
    };

    const scheduleNext = () => {
      if (cancelled) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        await refreshIfChanged(false);
        scheduleNext();
      }, getPollInterval());
    };

    void refreshIfChanged(true).finally(scheduleNext);

    const forceResumeRefresh = () => {
      void refreshIfChanged(true).finally(scheduleNext);
    };

    const handleFocus = () => {
      forceResumeRefresh();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        forceResumeRefresh();
      } else {
        scheduleNext();
      }
    };

    const handlePageShow = () => {
      forceResumeRefresh();
    };

    const handleOnline = () => {
      forceResumeRefresh();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [currentRole, loadRequests, normalizedHotelSlug, shouldLoadStaffData]);

  const updateRequestStatus = useCallback(
    async (id: string, status: StaffRequestStatus) => {
      if (!normalizedHotelSlug || !currentRole) return;

      try {
        await updateStaffRequestStatus({
          id,
          status,
          hotelSlug: normalizedHotelSlug,
          role: currentRole,
        });

        await loadRequests();
      } catch (error) {
        console.error("Failed to update staff request status", error);
      }
    },
    [currentRole, loadRequests, normalizedHotelSlug]
  );

  const setRequestBillingStatus = useCallback(
    async (id: string, billingStatus: StaffBillingStatus) => {
      if (!normalizedHotelSlug || !currentRole) return;

      try {
        await setStaffRequestBillingStatus({
          id,
          hotelSlug: normalizedHotelSlug,
          role: currentRole,
          billingStatus,
        });

        await loadRequests();
      } catch (error) {
        console.error("Failed to update staff request billing status", error);
        if (typeof window !== "undefined") {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to update billing status";
          window.alert(message);
        }
      }
    },
    [currentRole, loadRequests, normalizedHotelSlug]
  );

  const chargeRequest = useCallback(
    async (id: string) => {
      await setRequestBillingStatus(id, "charged");
    },
    [setRequestBillingStatus]
  );

  const addRequest = useCallback(
    async (input: AddRequestInput) => {
      try {
        await createStaffRequest({
          ...input,
          ...(normalizedHotelId ? { hotelId: normalizedHotelId } : {}),
          ...(normalizedHotelSlug ? { hotelSlug: normalizedHotelSlug } : {}),
        });

        await loadRequests();
      } catch (error) {
        console.error("Failed to create staff request", error);
      }
    },
    [loadRequests, normalizedHotelId, normalizedHotelSlug]
  );

  const getOperationalRequestsByDepartment = useCallback(
    (department: StaffDepartment) => {
      return requests.filter(
        (request) =>
          request.department === department && isOperationalRequest(request)
      );
    },
    [requests]
  );

  const getRequestsByDepartment = useCallback(
    (department: StaffDepartment) => {
      return requests.filter((request) => request.department === department);
    },
    [requests]
  );

  const getAllRequests = useCallback(() => {
    return requests;
  }, [requests]);

  const getOperationalAllRequests = useCallback(() => {
    return requests.filter(isOperationalRequest);
  }, [requests]);

  const resetRequests = useCallback(async () => {
    await loadRequests();
  }, [loadRequests]);

  const value = useMemo<StaffStoreContextValue>(
    () => ({
      requests,
      hotelId: normalizedHotelId,
      hotelSlug: normalizedHotelSlug,
      updateRequestStatus,
      setRequestBillingStatus,
      chargeRequest,
      addRequest,
      getRequestsByDepartment,
      getOperationalRequestsByDepartment,
      getAllRequests,
      getOperationalAllRequests,
      resetRequests,
    }),
    [
      requests,
      normalizedHotelId,
      normalizedHotelSlug,
      updateRequestStatus,
      setRequestBillingStatus,
      chargeRequest,
      addRequest,
      getRequestsByDepartment,
      getOperationalRequestsByDepartment,
      getAllRequests,
      getOperationalAllRequests,
      resetRequests,
    ]
  );

  if (shouldLoadStaffData && !isReady) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
            Loading Staff Hub…
          </div>
        </div>
      </div>
    );
  }

  return (
    <StaffStoreContext.Provider value={value}>
      {children}
    </StaffStoreContext.Provider>
  );
}

export function useStaffStore() {
  const context = useContext(StaffStoreContext);

  if (!context) {
    throw new Error("useStaffStore must be used inside StaffStoreProvider");
  }

  return context;
}