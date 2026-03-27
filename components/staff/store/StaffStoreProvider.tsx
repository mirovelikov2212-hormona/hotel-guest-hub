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
  void hotelSlug;
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [isReady, setIsReady] = useState(false);

  const loadRequests = useCallback(async () => {
    try {
      const data = await fetchSupabaseRequests();
      setRequests(data);
    } catch (error) {
      console.error("Failed to load staff requests from Supabase", error);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
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
  }, [loadRequests]);

  const updateRequestStatus = useCallback(
    async (id: string, status: StaffRequestStatus) => {
      try {
        await updateSupabaseRequestStatus(id, status);
        await loadRequests();
      } catch (error) {
        console.error("Failed to update staff request status", error);
      }
    },
    [loadRequests]
  );

  const addRequest = useCallback(
    async (input: AddRequestInput) => {
      try {
        await createSupabaseRequest(input);
        await loadRequests();
      } catch (error) {
        console.error("Failed to create staff request", error);
      }
    },
    [loadRequests]
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
      updateRequestStatus,
      addRequest,
      getRequestsByDepartment,
      getOperationalRequestsByDepartment,
      getAllRequests,
      getOperationalAllRequests,
      resetRequests,
    ]
  );

  if (!isReady) {
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