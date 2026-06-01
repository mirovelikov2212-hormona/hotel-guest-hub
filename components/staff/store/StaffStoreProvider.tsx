"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type {
  StaffDepartment,
  StaffRequest,
  StaffRequestStatus,
  StaffRequestType,
  StaffServiceTime,
} from "@/lib/staff/types";

type StaffRole = "reception" | "housekeeping" | "maintenance" | "manager";

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

function readStaffCache(key?: string): StaffRequest[] {
  if (!key || typeof window === "undefined") return [];

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StaffRequest[]) : [];
  } catch {
    return [];
  }
}

function writeStaffCache(key: string | undefined, requests: StaffRequest[]) {
  if (!key || typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(key, JSON.stringify(requests));
  } catch (error) {
    console.error("writeStaffCache failed", error);
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
  });

  const response = await fetch(`/api/staff/requests?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

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

  if (!response.ok) {
    throw new Error(`Failed to update request status: ${response.status}`);
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

  useEffect(() => {
    if (!staffCacheKey) return;

    const cached = readStaffCache(staffCacheKey);
    setRequests(cached);

    if (cached.length) {
      setIsReady(true);
    }
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
      writeStaffCache(staffCacheKey, data);
    } catch (error) {
      console.error("Failed to load staff requests from API", error);
    } finally {
      setIsReady(true);
    }
  }, [currentRole, normalizedHotelSlug, staffCacheKey]);

  useEffect(() => {
    if (!shouldLoadStaffData) {
      setRequests([]);
      setIsReady(true);
      return;
    }

    let cancelled = false;

    const safeLoad = async () => {
      if (cancelled) return;

      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }

      try {
        await loadRequests();
      } catch (error) {
        console.error("auto refresh failed", error);
      }
    };

    void safeLoad();

    const interval = window.setInterval(() => {
      void safeLoad();
    }, 5000);

    const handleFocus = () => {
      void safeLoad();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void safeLoad();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadRequests, shouldLoadStaffData]);

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