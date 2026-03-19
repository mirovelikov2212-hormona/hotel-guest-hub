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
import { mockStaffRequests } from "@/lib/staff/mock-data";
import { createStaffRequest } from "@/lib/staff/create-staff-request";
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
  updateRequestStatus: (id: string, status: StaffRequestStatus) => void;
  addRequest: (input: AddRequestInput) => void;
  getRequestsByDepartment: (department: StaffDepartment) => StaffRequest[];
  getAllRequests: () => StaffRequest[];
  resetRequests: () => void;
};

const StaffStoreContext = createContext<StaffStoreContextValue | null>(null);

const STORAGE_KEY = "guesthub_staff_requests_v1";

export function StaffStoreProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (raw) {
        const parsed = JSON.parse(raw) as StaffRequest[];
        setRequests(parsed);
      } else {
        setRequests(mockStaffRequests);
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(mockStaffRequests)
        );
      }
    } catch (error) {
      console.error("Failed to load staff requests from localStorage", error);
      setRequests(mockStaffRequests);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isReady) return;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
    } catch (error) {
      console.error("Failed to save staff requests to localStorage", error);
    }
  }, [requests, isReady]);

  const updateRequestStatus = useCallback(
    (id: string, status: StaffRequestStatus) => {
      setRequests((current) =>
        current.map((request) =>
          request.id === id ? { ...request, status } : request
        )
      );
    },
    []
  );

  const addRequest = useCallback((input: AddRequestInput) => {
    const nextRequest = createStaffRequest(input);

    setRequests((current) => [nextRequest, ...current]);
  }, []);

  const getRequestsByDepartment = useCallback(
    (department: StaffDepartment) => {
      return requests.filter((request) => request.department === department);
    },
    [requests]
  );

  const getAllRequests = useCallback(() => requests, [requests]);

  const resetRequests = useCallback(() => {
    setRequests(mockStaffRequests);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mockStaffRequests));
    } catch (error) {
      console.error("Failed to reset staff requests", error);
    }
  }, []);

  const value = useMemo<StaffStoreContextValue>(
    () => ({
      requests,
      updateRequestStatus,
      addRequest,
      getRequestsByDepartment,
      getAllRequests,
      resetRequests,
    }),
    [requests, updateRequestStatus, addRequest, getRequestsByDepartment, getAllRequests, resetRequests]
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