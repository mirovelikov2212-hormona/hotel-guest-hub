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
import { getHotelIdBySlug } from "@/lib/hotels/getHotelIdBySlug";
import {
  createSupabaseRequest,
  fetchSupabaseRequests,
  updateSupabaseRequestStatus,
} from "@/lib/staff/supabase-requests";
import type {
  StaffDepartment,
  StaffRequest,
  StaffRequestStatus,
  StaffRequestType,
  StaffServiceTime,
} from "@/lib/staff/types";

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

function getTodayDateKey() {
  return new Date().toLocaleDateString("sv-SE");
}

function isOperationalRequest(request: StaffRequest) {
  return (
    request.createdDateKey === getTodayDateKey() ||
    request.status !== "completed"
  );
}

export function StaffStoreProvider({
  children,
  hotelSlug,
}: {
  children: ReactNode;
  hotelSlug?: string;
}) {
  const normalizedHotelSlug = useMemo(
    () => String(hotelSlug ?? "").trim().toLowerCase() || undefined,
    [hotelSlug]
  );
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [resolvedHotelId, setResolvedHotelId] = useState<string | undefined>(undefined);
  const [scopeReady, setScopeReady] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const resolveScope = async () => {
      setScopeReady(false);
      setIsReady(false);

      try {
        const hotelId = await getHotelIdBySlug(normalizedHotelSlug);
        if (!cancelled) {
          setResolvedHotelId(hotelId);
        }
      } catch (error) {
        console.error("Failed to resolve hotel scope for staff hub", {
          hotelSlug: normalizedHotelSlug,
          error,
        });
        if (!cancelled) {
          setResolvedHotelId(undefined);
          setRequests([]);
        }
      } finally {
        if (!cancelled) {
          setScopeReady(true);
        }
      }
    };

    void resolveScope();

    return () => {
      cancelled = true;
    };
  }, [normalizedHotelSlug]);

  const loadRequests = useCallback(async () => {
    if (!scopeReady) return;

    try {
      const data = await fetchSupabaseRequests(
        resolvedHotelId
          ? { hotelId: resolvedHotelId, hotelSlug: normalizedHotelSlug }
          : normalizedHotelSlug
            ? { hotelSlug: normalizedHotelSlug }
            : undefined
      );
      setRequests(data);
    } catch (error) {
      console.error("Failed to load staff requests from Supabase", error);
      setRequests([]);
    } finally {
      setIsReady(true);
    }
  }, [normalizedHotelSlug, resolvedHotelId, scopeReady]);

  useEffect(() => {
    if (!scopeReady) return;

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
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadRequests, scopeReady]);

  const updateRequestStatus = useCallback(
    async (id: string, status: StaffRequestStatus) => {
      try {
        await updateSupabaseRequestStatus(
          id,
          status,
          resolvedHotelId
            ? { hotelId: resolvedHotelId, hotelSlug: normalizedHotelSlug }
            : normalizedHotelSlug
              ? { hotelSlug: normalizedHotelSlug }
              : undefined
        );
        await loadRequests();
      } catch (error) {
        console.error("Failed to update staff request status", error);
      }
    },
    [loadRequests, normalizedHotelSlug, resolvedHotelId]
  );

  const addRequest = useCallback(
    async (input: AddRequestInput) => {
      try {
        await createSupabaseRequest({
          ...input,
          ...(resolvedHotelId
            ? { hotelId: resolvedHotelId, hotelSlug: normalizedHotelSlug }
            : normalizedHotelSlug
              ? { hotelSlug: normalizedHotelSlug }
              : {}),
        });
        await loadRequests();
      } catch (error) {
        console.error("Failed to create staff request", error);
      }
    },
    [loadRequests, normalizedHotelSlug, resolvedHotelId]
  );

  const getRequestsByDepartment = useCallback(
    (department: StaffDepartment) => {
      return requests.filter((request) => request.department === department);
    },
    [requests]
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
      hotelId: resolvedHotelId,
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
      resolvedHotelId,
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

  if (!scopeReady || !isReady) {
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
