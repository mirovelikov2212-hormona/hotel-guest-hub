"use client";

import { useState } from "react";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import type { StaffRequestType, StaffServiceTime } from "@/lib/staff/types";

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

export default function StaffTestCreatePage() {
  const { addRequest, resetRequests } = useStaffStore();

  const [room, setRoom] = useState("204");
  const [type, setType] = useState<StaffRequestType>("towels");
  const [serviceTime, setServiceTime] = useState<StaffServiceTime>("now");
  const [note, setNote] = useState("");

  const selectedOption =
    requestOptions.find((option) => option.value === type) ?? requestOptions[0];

  return (
    <main className="space-y-6 pb-safe">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-2xl font-semibold tracking-tight">
          Test Create Request
        </h2>
        <p className="mt-2 text-sm leading-6 text-white/70">
          Temporary test screen for the Staff Hub engine. This lets us create
          new requests and verify that routing to the correct department works.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm text-white/70">Room</span>
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
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

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm text-white/70">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              addRequest({
                room,
                type,
                typeLabel: selectedOption.label,
                serviceTime,
                note: note.trim() || undefined,
              });
              setNote("");
            }}
            className="rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-white transition hover:bg-emerald-400"
          >
            Add request
          </button>

          <button
            type="button"
            onClick={resetRequests}
            className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3 font-semibold text-white/80 transition hover:bg-white/10"
          >
            Reset mock requests
          </button>
        </div>
      </section>
    </main>
  );
}