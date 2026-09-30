"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useStaffUi } from "@/components/staff/StaffUiProvider";

type MassageReservation = {
  id: string;
  room: string;
  serviceId: string;
  serviceName: string;
  date: string | null;
  time: string | null;
  durationMinutes: number | null;
  price: number;
  currency: string;
  requestStatus: string;
  billingStatus: string;
  createdAt: string;
  resolvedAt: string | null;
  authorityMode: string | null;
  nativeBookingId: string | null;
  isTest: boolean;
};

type FeedPayload = {
  ok?: boolean;
  canManageBilling?: boolean;
  reservations?: MassageReservation[];
};

const COPY = {
  bg: {
    eyebrow: "МАСАЖИ",
    title: "Резервации за масаж",
    subtitle: "Всички резервации, направени от Guest Hub-а за този хотел.",
    active: "За обработка",
    history: "История",
    all: "Всички",
    room: "Стая",
    date: "Дата",
    time: "Час",
    duration: "Продължителност",
    price: "Цена",
    minutes: "мин.",
    confirmed: "Потвърдена резервация",
    pending: "Чака начисляване",
    charged: "Начислено",
    waived: "Без начисляване",
    cancelled: "Отказана",
    charge: "Начисли",
    waive: "Без начисляване",
    cancel: "Гостът отказа",
    empty: "Няма резервации за масаж в този изглед.",
    loading: "Зареждане на резервациите…",
    error: "Резервациите за масаж временно не могат да бъдат заредени.",
    test: "ТЕСТ",
    refresh: "Обнови",
  },
  en: {
    eyebrow: "MASSAGES",
    title: "Massage reservations",
    subtitle: "All massage reservations created through this hotel's Guest Hub.",
    active: "Needs action",
    history: "History",
    all: "All",
    room: "Room",
    date: "Date",
    time: "Time",
    duration: "Duration",
    price: "Price",
    minutes: "min",
    confirmed: "Confirmed reservation",
    pending: "Pending charge",
    charged: "Charged",
    waived: "No charge",
    cancelled: "Cancelled",
    charge: "Charge",
    waive: "No charge",
    cancel: "Guest cancelled",
    empty: "No massage reservations in this view.",
    loading: "Loading massage reservations…",
    error: "Massage reservations are temporarily unavailable.",
    test: "TEST",
    refresh: "Refresh",
  },
  de: {
    eyebrow: "MASSAGEN",
    title: "Massage-Reservierungen",
    subtitle: "Alle über den Guest Hub dieses Hotels erstellten Massage-Reservierungen.",
    active: "Zu bearbeiten",
    history: "Historie",
    all: "Alle",
    room: "Zimmer",
    date: "Datum",
    time: "Uhrzeit",
    duration: "Dauer",
    price: "Preis",
    minutes: "Min.",
    confirmed: "Bestätigte Reservierung",
    pending: "Buchung offen",
    charged: "Gebucht",
    waived: "Ohne Buchung",
    cancelled: "Storniert",
    charge: "Buchen",
    waive: "Ohne Buchung",
    cancel: "Gast storniert",
    empty: "Keine Massage-Reservierungen in dieser Ansicht.",
    loading: "Massage-Reservierungen werden geladen…",
    error: "Massage-Reservierungen sind vorübergehend nicht verfügbar.",
    test: "TEST",
    refresh: "Aktualisieren",
  },
} as const;

function billingLabel(status: string, copy: (typeof COPY)["bg"]) {
  if (status === "charged") return copy.charged;
  if (status === "waived") return copy.waived;
  if (status === "cancelled") return copy.cancelled;
  return copy.pending;
}

function formatBookingDate(dateIso: string | null, lang: "bg" | "en" | "de") {
  if (!dateIso) return "—";
  const [year, month, day] = dateIso.split("-").map(Number);
  if (!year || !month || !day) return dateIso;
  return new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : lang === "de" ? "de-DE" : "en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function sortReservations(rows: MassageReservation[]) {
  return [...rows].sort((a, b) => {
    const aKey = `${a.date || "9999-99-99"}T${a.time || "99:99"}`;
    const bKey = `${b.date || "9999-99-99"}T${b.time || "99:99"}`;
    const cmp = aKey.localeCompare(bKey);
    if (cmp !== 0) return cmp;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

export default function StaffMassageReservationsPanel({
  hotelSlug,
  role,
}: {
  hotelSlug: string;
  role: string;
}) {
  const { lang } = useStaffUi();
  const copy = COPY[lang] || COPY.en;
  const [reservations, setReservations] = useState<MassageReservation[]>([]);
  const [canManageBilling, setCanManageBilling] = useState(false);
  const [filter, setFilter] = useState<"active" | "history" | "all">("active");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      hotelSlug,
      role,
      _: String(Date.now()),
    });

    const response = await fetch(`/api/staff/massage-reservations?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });

    if (response.status === 401 || response.status === 403) {
      setError(copy.error);
      setReady(true);
      return;
    }

    if (!response.ok) throw new Error(`massage reservations ${response.status}`);

    const payload = (await response.json()) as FeedPayload;
    setReservations(Array.isArray(payload.reservations) ? payload.reservations : []);
    setCanManageBilling(payload.canManageBilling === true);
    setError("");
    setReady(true);
  }, [copy.error, hotelSlug, role]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await load();
      } catch (loadError) {
        console.error("massage reservations load failed", loadError);
        if (!cancelled) {
          setError(copy.error);
          setReady(true);
        }
      }
    };

    void run();
    const timer = window.setInterval(() => void run(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [copy.error, load]);

  const visible = useMemo(() => {
    const sorted = sortReservations(reservations);
    if (filter === "active") {
      return sorted.filter((row) => row.billingStatus === "pending");
    }
    if (filter === "history") {
      return sorted.filter((row) => row.billingStatus !== "pending");
    }
    return sorted;
  }, [filter, reservations]);

  const counts = useMemo(() => ({
    active: reservations.filter((row) => row.billingStatus === "pending").length,
    history: reservations.filter((row) => row.billingStatus !== "pending").length,
    all: reservations.length,
  }), [reservations]);

  async function updateBilling(id: string, billingStatus: "charged" | "waived" | "cancelled") {
    if (!canManageBilling) return;
    setBusyId(id);
    try {
      const response = await fetch("/api/staff/request-billing", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelSlug,
          role,
          requestId: id,
          billingStatus,
        }),
      });
      if (!response.ok) throw new Error(`billing ${response.status}`);
      await load();
    } catch (billingError) {
      console.error("massage billing update failed", billingError);
      setError(copy.error);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/40">{copy.eyebrow}</p>
          <h3 className="staff-section-title mt-1 text-xl font-semibold text-white">{copy.title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">{copy.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-white/15 bg-black/20 px-4 py-2 text-sm font-semibold text-white/75"
        >
          {copy.refresh}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {([
          ["active", copy.active, counts.active],
          ["history", copy.history, counts.history],
          ["all", copy.all, counts.all],
        ] as const).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filter === value
                ? "border-sky-300/40 bg-sky-300/15 text-sky-100"
                : "border-white/10 bg-black/20 text-white/60"
            }`}
          >
            {label} · {count}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!ready ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/60">
          {copy.loading}
        </div>
      ) : visible.length ? (
        <div className="mt-4 grid gap-3">
          {visible.map((reservation) => (
            <article key={reservation.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                      {copy.confirmed}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/65">
                      {billingLabel(reservation.billingStatus, copy)}
                    </span>
                    {reservation.isTest ? (
                      <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-xs font-semibold text-amber-100">
                        {copy.test}
                      </span>
                    ) : null}
                  </div>
                  <h4 className="mt-3 text-base font-semibold text-white">{reservation.serviceName}</h4>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/65">
                    <span>{copy.room}: <strong className="text-white/85">{reservation.room}</strong></span>
                    <span>{copy.date}: <strong className="text-white/85">{formatBookingDate(reservation.date, lang)}</strong></span>
                    <span>{copy.time}: <strong className="text-white/85">{reservation.time || "—"}</strong></span>
                    {reservation.durationMinutes ? (
                      <span>{copy.duration}: <strong className="text-white/85">{reservation.durationMinutes} {copy.minutes}</strong></span>
                    ) : null}
                    <span>{copy.price}: <strong className="text-white/85">{reservation.price.toFixed(2)} {reservation.currency}</strong></span>
                  </div>
                </div>

                {canManageBilling && reservation.billingStatus === "pending" ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === reservation.id}
                      onClick={() => void updateBilling(reservation.id, "charged")}
                      className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
                    >
                      {copy.charge}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === reservation.id}
                      onClick={() => void updateBilling(reservation.id, "waived")}
                      className="rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-100 disabled:opacity-50"
                    >
                      {copy.waive}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === reservation.id}
                      onClick={() => void updateBilling(reservation.id, "cancelled")}
                      className="rounded-xl border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-xs font-semibold text-rose-100 disabled:opacity-50"
                    >
                      {copy.cancel}
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/60">
          {copy.empty}
        </div>
      )}
    </section>
  );
}
