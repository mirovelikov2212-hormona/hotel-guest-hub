"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import StaffRequestCard from "@/components/staff/StaffRequestCard";
import {
  createSupabaseRequest,
  fetchSupabaseRequests,
  updateSupabaseRequestStatus,
} from "@/lib/staff/supabase-requests";
import type {
  StaffRequest,
  StaffRequestType,
  StaffServiceTime,
  StaffRequestStatus,
} from "@/lib/staff/types";

const requestOptions: { value: StaffRequestType; label: string }[] = [
  { value: "towels", label: "Towels" },
  { value: "toilet_paper", label: "Toilet paper" },
  { value: "extra_pillow", label: "Extra pillow" },
  { value: "extra_blanket", label: "Extra blanket" },
  { value: "bathrobe", label: "Bathrobe" },
  { value: "slippers", label: "Slippers" },
  { value: "baby_cot", label: "Baby cot" },
  { value: "air_conditioning", label: "Air conditioning problem" },
  { value: "light_not_working", label: "Light not working" },
  { value: "no_hot_water", label: "No hot water" },
  { value: "tv_issue", label: "TV issue" },
  { value: "bathroom_issue", label: "Bathroom issue" },
  { value: "other_technical_issue", label: "Other technical issue" },
  { value: "taxi", label: "Taxi" },
  { value: "late_checkout", label: "Late checkout request" },
  { value: "wake_up_call", label: "Wake up call" },
  { value: "information", label: "Information" },
  { value: "restaurant_reservation", label: "Restaurant reservation" },
];

const statusOptions: { value: StaffRequestStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "returned", label: "Returned" },
];

export default function StaffTestCreatePage() {
  const [room, setRoom] = useState("204");
  const [type, setType] = useState<StaffRequestType>("towels");
  const [serviceTime, setServiceTime] = useState<StaffServiceTime>("now");
  const [note, setNote] = useState("");
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<StaffRequestStatus | "all">(
    "all"
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedOption =
    requestOptions.find((option) => option.value === type) ?? requestOptions[0];

  const visibleRequests = useMemo(() => {
    if (statusFilter === "all") return requests;
    return requests.filter((request) => request.status === statusFilter);
  }, [requests, statusFilter]);

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchSupabaseRequests();
      setRequests(data);
    } catch (loadError) {
      console.error(loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to fetch requests from Supabase."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function handleCreate() {
    const trimmedRoom = room.trim();
    const trimmedNote = note.trim();

    if (!trimmedRoom) {
      setError("Room is required.");
      setSuccess(null);
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const created = await createSupabaseRequest({
        room: trimmedRoom,
        type,
        typeLabel: selectedOption.label,
        serviceTime,
        note: trimmedNote || undefined,
      });

      setRequests((current) => [created, ...current]);
      setNote("");
      setSuccess(`Created request ${created.typeLabel} for room ${created.room}.`);
    } catch (createError) {
      console.error(createError);
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create request in Supabase."
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleStatusUpdate(id: string, status: StaffRequestStatus) {
    setUpdatingId(id);
    setError(null);
    setSuccess(null);

    try {
      await updateSupabaseRequestStatus(id, status);
      const updated = await fetchSupabaseRequests();
      setRequests(updated);
      setSuccess(`Updated request status to ${status.replace("_", " ")}.`);
    } catch (updateError) {
      console.error(updateError);
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update request status in Supabase."
      );
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="space-y-6 pb-safe">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-2xl font-semibold tracking-tight">
          Supabase Request Test
        </h2>
        <p className="mt-2 text-sm leading-6 text-white/70">
          Real database test page for create, fetch and status update. No mock
          store. This is the safe checkpoint before we bridge Guest Hub to the
          staff engine.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm text-white/70">Room</span>
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="204"
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm text-white/70">Request type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as StaffRequestType)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            >
              {requestOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  className="bg-neutral-900 text-white"
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm text-white/70">Service time</span>
            <select
              value={serviceTime}
              onChange={(e) =>
                setServiceTime(e.target.value as StaffServiceTime)
              }
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            >
              <option value="now" className="bg-neutral-900 text-white">
                Now
              </option>
              <option value="tomorrow" className="bg-neutral-900 text-white">
                Tomorrow
              </option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm text-white/70">Status filter</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as StaffRequestStatus | "all")
              }
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            >
              {statusOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  className="bg-neutral-900 text-white"
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm text-white/70">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Optional note for the department"
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            />
          </label>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {success}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isCreating}
            className="rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? "Creating..." : "Create in Supabase"}
          </button>

          <button
            type="button"
            onClick={() => void loadRequests()}
            disabled={isLoading}
            className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3 font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Refreshing..." : "Fetch from Supabase"}
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">
              Live request list
            </h3>
            <p className="mt-1 text-sm text-white/60">
              Showing {visibleRequests.length} request
              {visibleRequests.length === 1 ? "" : "s"} from Supabase.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
            Loading requests from Supabase...
          </div>
        ) : null}

        {!isLoading && visibleRequests.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
            No requests found for the current hotel and filter.
          </div>
        ) : null}

        {!isLoading
          ? visibleRequests.map((request) => {
              const canAct = updatingId !== request.id;

              return (
                <div key={request.id} className="space-y-3">
                  <StaffRequestCard
                    request={request}
                    mode="manager"
                    canAct={false}
                  />

                  <div className="grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() =>
                        void handleStatusUpdate(request.id, "in_progress")
                      }
                      disabled={!canAct}
                      className="min-h-12 rounded-2xl bg-sky-500 px-4 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {updatingId === request.id && request.status !== "in_progress"
                        ? "Updating..."
                        : "Set In Progress"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleStatusUpdate(request.id, "completed")}
                      disabled={!canAct}
                      className="min-h-12 rounded-2xl bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {updatingId === request.id && request.status !== "completed"
                        ? "Updating..."
                        : "Set Completed"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleStatusUpdate(request.id, "returned")}
                      disabled={!canAct}
                      className="min-h-12 rounded-2xl border border-rose-400/30 bg-rose-400/15 px-4 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/25 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {updatingId === request.id && request.status !== "returned"
                        ? "Updating..."
                        : "Set Returned"}
                    </button>
                  </div>
                </div>
              );
            })
          : null}
      </section>
    </main>
  );
}
