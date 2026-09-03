"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import StaffCollapsiblePanel from "@/components/staff/StaffCollapsiblePanel";
import { useStaffUi } from "@/components/staff/StaffUiProvider";

type RoomState = {
  roomNumber: string;
  floor: string | null;
  building: string | null;
  roomType: string | null;
  activeStay: boolean;
  activeStayCount: number;
  isTestStay: boolean;
  pushDevices: number;
  lastSeenAt: string | null;
};

type RoomActivityPayload = {
  ok?: boolean;
  generatedAt?: string;
  summary?: {
    totalRooms: number;
    activeRooms: number;
    inactiveRooms: number;
    pushCoveredRooms: number;
    pushDevices: number;
    pushCoveragePercent: number;
    unconfiguredActiveRooms: number;
  };
  rooms?: RoomState[];
};

const COPY = {
  bg: {
    title: "StayHub активност по стаи",
    summary: "Активни StayHub престои и push покритие по стаи. Това не е PMS заетост.",
    total: "Общо стаи",
    active: "Активни StayHub",
    inactive: "Без активен stay",
    push: "Push покритие",
    pushDevices: "Push устройства",
    activeStay: "Активен stay",
    noActiveStay: "Без активен stay",
    test: "TEST",
    warning: "Има активен StayHub престой за неконфигурирана стая. Провери Rooms конфигурацията.",
    empty: "Няма конфигурирани активни стаи за този хотел.",
    unavailable: "Картата на стаите временно не е достъпна.",
    updated: "Обновено",
  },
  en: {
    title: "StayHub room activity",
    summary: "Active StayHub stays and push coverage by room. This is not PMS occupancy.",
    total: "Total rooms",
    active: "Active StayHub",
    inactive: "No active stay",
    push: "Push coverage",
    pushDevices: "Push devices",
    activeStay: "Active stay",
    noActiveStay: "No active stay",
    test: "TEST",
    warning: "An active StayHub stay exists for an unconfigured room. Check the Rooms configuration.",
    empty: "There are no configured active rooms for this hotel.",
    unavailable: "The room activity map is temporarily unavailable.",
    updated: "Updated",
  },
  de: {
    title: "StayHub-Zimmeraktivität",
    summary: "Aktive StayHub-Aufenthalte und Push-Abdeckung nach Zimmer. Dies ist keine PMS-Belegung.",
    total: "Zimmer gesamt",
    active: "StayHub aktiv",
    inactive: "Kein aktiver Aufenthalt",
    push: "Push-Abdeckung",
    pushDevices: "Push-Geräte",
    activeStay: "Aktiver Aufenthalt",
    noActiveStay: "Kein aktiver Aufenthalt",
    test: "TEST",
    warning: "Für ein nicht konfiguriertes Zimmer besteht ein aktiver StayHub-Aufenthalt. Bitte Rooms-Konfiguration prüfen.",
    empty: "Für dieses Hotel sind keine aktiven Zimmer konfiguriert.",
    unavailable: "Die Zimmeraktivitätskarte ist vorübergehend nicht verfügbar.",
    updated: "Aktualisiert",
  },
} as const;

function formatUpdated(value: string | undefined, lang: "bg" | "en" | "de") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : lang === "de" ? "de-DE" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function StaffRoomActivityMap({ hotelSlug, role }: { hotelSlug: string; role: "reception" | "manager" }) {
  const { lang } = useStaffUi();
  const uiLang: "bg" | "en" | "de" = lang === "de" ? "de" : lang === "en" ? "en" : "bg";
  const copy = COPY[uiLang];
  const [payload, setPayload] = useState<RoomActivityPayload | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ hotelSlug, role, _: String(Date.now()) });
      const response = await fetch(`/api/staff/room-activity?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        setPayload(null);
        return;
      }
      if (!response.ok) throw new Error(`room activity ${response.status}`);
      setPayload(await response.json() as RoomActivityPayload);
      setError("");
    } catch (loadError) {
      console.error("Staff room activity load failed", loadError);
      setError(copy.unavailable);
    }
  }, [copy.unavailable, hotelSlug, role]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const rooms = payload?.rooms || [];
  const summary = payload?.summary;
  const badge = summary ? (
    <span className="rounded-full border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-2.5 py-1 text-xs font-semibold">
      {copy.active} {summary.activeRooms} / {summary.totalRooms}
    </span>
  ) : null;

  const updated = useMemo(() => formatUpdated(payload?.generatedAt, uiLang), [payload?.generatedAt, uiLang]);

  return (
    <div className="mb-5">
      <StaffCollapsiblePanel title={copy.title} summary={copy.summary} badge={badge}>
        {error ? <div className="mb-4 rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-700">{error}</div> : null}
        {summary?.unconfiguredActiveRooms ? (
          <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-800">
            {copy.warning} ({summary.unconfiguredActiveRooms})
          </div>
        ) : null}

        {summary ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[var(--staff-border)] bg-[var(--staff-surface)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--staff-muted)]">{copy.total}</p>
              <p className="mt-1 text-2xl font-semibold">{summary.totalRooms}</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/35 bg-emerald-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{copy.active}</p>
              <p className="mt-1 text-2xl font-semibold">{summary.activeRooms}</p>
            </div>
            <div className="rounded-2xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--staff-muted)]">{copy.inactive}</p>
              <p className="mt-1 text-2xl font-semibold">{summary.inactiveRooms}</p>
            </div>
            <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{copy.push}</p>
              <p className="mt-1 text-2xl font-semibold">{summary.pushCoveragePercent}%</p>
              <p className="mt-1 text-xs text-[var(--staff-muted)]">{summary.pushCoveredRooms} / {summary.activeRooms} · {copy.pushDevices}: {summary.pushDevices}</p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--staff-muted)]">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />{copy.activeStay}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-[var(--staff-border)] bg-[var(--staff-surface-muted)]" />{copy.noActiveStay}</span>
          {updated ? <span className="ml-auto">{copy.updated}: {updated}</span> : null}
        </div>

        {rooms.length ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9">
            {rooms.map((room) => (
              <div
                key={room.roomNumber}
                className={`rounded-xl border p-3 ${room.activeStay ? "border-emerald-400/40 bg-emerald-500/10" : "border-[var(--staff-border)] bg-[var(--staff-surface-muted)]"}`}
                title={[room.roomType, room.floor ? `Floor ${room.floor}` : null, room.building].filter(Boolean).join(" · ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold">{room.roomNumber}</span>
                  {room.isTestStay ? <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">{copy.test}</span> : null}
                </div>
                <p className={`mt-1 text-[11px] ${room.activeStay ? "text-emerald-700" : "text-[var(--staff-muted)]"}`}>
                  {room.activeStay ? copy.activeStay : copy.noActiveStay}
                </p>
                {room.activeStay && room.pushDevices ? (
                  <span className="mt-2 inline-flex rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                    Push {room.pushDevices}
                  </span>
                ) : null}
                {room.activeStayCount > 1 ? (
                  <span className="mt-2 block text-[10px] font-semibold text-amber-700">stay × {room.activeStayCount}</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : payload ? (
          <div className="mt-4 rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] p-5 text-sm text-[var(--staff-muted)]">{copy.empty}</div>
        ) : null}
      </StaffCollapsiblePanel>
    </div>
  );
}
