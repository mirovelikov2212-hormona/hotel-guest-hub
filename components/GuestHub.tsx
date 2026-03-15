"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { HotelConfig, LangKey, HubSection, DepartmentKey } from "@/lib/types";
import InstallAppButton from "@/components/InstallAppButton";
import {
  buildWhatsAppLink,
  isAfterCutoffLocal,
  isWithinHoursLocal,
  safeTelLink,
} from "@/lib/utils";

function clsx(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

const reDate = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(\d{4})$/; // DD.MM.YYYY
const reTime = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM

function askRequired(label: string, example: string, re: RegExp, invalidMsg: string) {
  while (true) {
    const v = (window.prompt(label, example) || "").trim();
    if (!v) return null;
    if (re.test(v)) return v;
    window.alert(invalidMsg);
  }
}

type VenueRow = {
  category?: string;
  type?: string;
  name: string;
  active?: boolean;
  sortOrder?: number | string;

  shortDescription?: string;
  description?: string;
  cuisine?: string;
  hours?: string;
  open?: string;
  close?: string;
  menuUrl?: string;
  location?: string;

  requiresReservation?: boolean;

  reservationType?: "whatsapp" | "phone" | "url" | "email" | "none";
  reservationUrl?: string;
  reservationPhone?: string;
  reservationWhatsapp?: string;
  reservationEmail?: string;
  reservationLabel?: string;
  reservationMessage?: string;

  programUrl?: string;
  programText?: string;
  ageGroup?: string;

  whatsapp?: string;
  phone?: string;
};

function normalizeCategory(v: VenueRow) {
  const raw = String(v.category || v.type || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  const allowed = new Set([
    "restaurants",
    "bars",
    "spa",
    "lounge",
    "kids",
    "pool",
    "gym",
    "room_service",
  ]);

  if (allowed.has(raw)) return raw;

  // backward compatibility / migration aliases
  const aliasMap: Record<string, string> = {
    restaurant: "restaurants",
    bar: "bars",
    kidsclub: "kids",
    kids_club: "kids",
    fitness: "gym",
    roomservice: "room_service",
  };

  if (aliasMap[raw]) return aliasMap[raw];

  // production-safe fallback
  return "restaurants";
}

function categoryMeta(category: string) {
  const meta: Record<string, { title: string; icon: string }> = {
    restaurants: { title: "Restaurants", icon: "🍽️" },
    bars: { title: "Bars", icon: "🍸" },
    spa: { title: "Spa", icon: "🧖" },
    lounge: { title: "Lounge", icon: "🛋️" },
    kids: { title: "Kids Club", icon: "🧒" },
    pool: { title: "Pool", icon: "🏖️" },
    gym: { title: "Fitness", icon: "🏋️" },
    room_service: { title: "Room Service", icon: "🛎️" },
  };

  return meta[category] ?? meta.restaurants;
}

function getCategoryDisplayTitle(category: string, tUI: (k: string) => any) {
  const key = `outlet_type_${category}`;
  const translated = String(tUI(key) || "").trim();

  if (translated && translated !== key) {
    return translated;
  }

  return categoryMeta(category).title;
}

export default function GuestHub({ config }: { config: HotelConfig }) {
  const [lang, setLang] = useState<LangKey>(config.languageDefault ?? "en");

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);

  const [aiQ, setAiQ] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const sp = useSearchParams();
  const room = sp.get("room") || "";

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setCanInstall(false);
    }

    setDeferredPrompt(null);
  };

  void installApp;
  void canInstall;

  const tUI = (key: string) => config.i18n?.[String(lang)]?.[key] ?? key;

  const opsLang = (config.opsLanguage ?? "bg") as LangKey;
  const tOPS = (key: string) => config.i18n?.[String(opsLang)]?.[key] ?? key;

  const helperEnabled = Boolean(config.staffHelperEnabled);
  const helperLang = (config.staffHelperLanguage ?? "en") as LangKey;
  const tHELP = (key: string) => config.i18n?.[String(helperLang)]?.[key] ?? key;

  const roomPrefix = room ? `Room ${room} - ` : "";

  const contact = config.contacts;
  const deptHours = config.departmentHours ?? {};

  const isDeptOpen = (dept: DepartmentKey) => {
    const h = deptHours?.[dept];
    if (!h?.open || !h?.close) return true;
    return isWithinHoursLocal(h.open, h.close);
  };

  const warnAndRouteIfClosed = (dept: DepartmentKey) => {
    if (isDeptOpen(dept)) return { dept, warned: false };
    return { dept: "reception" as const, warned: true };
  };

  const closedMsg =
    (tUI("dept_closed_to_reception") as string) ||
    "Отделът не работи в момента. Заявката ще бъде изпратена към рецепция.";

  const afterCutoffLegacy = useMemo(() => {
    return isAfterCutoffLocal(config.housekeepingCutoff ?? "17:00");
  }, [config.housekeepingCutoff]);

  const housekeepingRoutedToReception =
    deptHours.housekeeping?.open && deptHours.housekeeping?.close
      ? !isDeptOpen("housekeeping")
      : afterCutoffLegacy;

  const hkExtras =
    (config.housekeepingExtras as Array<{ key: string; labelKey: string; messageKey: string }> | undefined) ??
    [
      { key: "laundry", labelKey: "laundry", messageKey: "msg_laundry" },
      { key: "iron", labelKey: "iron", messageKey: "msg_iron" },
      { key: "minibar", labelKey: "minibar", messageKey: "msg_minibar" },
      { key: "blanket", labelKey: "blanket", messageKey: "msg_blanket" },
    ];

  const taxiProviders = config.taxiProviders ?? [];
  const uberUrl =
    taxiProviders.find((p: { name?: string; url?: string }) => (p.name || "").toLowerCase() === "uber")?.url

  const rawVenueRows = (((config as any).venueRows ?? []) as Array<VenueRow>).filter(
    (v) => v && v.name && (v.type || v.category) && v.active !== false
  );

  const groupedOutlets = useMemo(() => {
    const grouped = rawVenueRows.reduce<Record<string, VenueRow[]>>((acc, row) => {
      const category = normalizeCategory(row);
      if (!acc[category]) acc[category] = [];
      acc[category].push(row);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([category, venues]) => ({
        category,
        meta: categoryMeta(category),
        venues: [...venues].sort(
          (a, b) => Number(a.sortOrder ?? 999) - Number(b.sortOrder ?? 999)
        ),
      }))
      .sort((a, b) => {
        const aMin = Math.min(...a.venues.map((x) => Number(x.sortOrder ?? 999)));
        const bMin = Math.min(...b.venues.map((x) => Number(x.sortOrder ?? 999)));
        return aMin - bMin;
      });
  }, [rawVenueRows]);

  const outletsSection =
    groupedOutlets.length > 0
      ? {
          id: "outlets",
          title: `🍴 ${String(tUI("outlets_title") || "Outlets")}`,
          items: [],
        }
      : null;

  const buildStaffMessage = (msgKey: string, filledOPS?: string, filledHELP?: string) => {
    const baseOPS = filledOPS ?? String(tOPS(msgKey));
    const main = `${roomPrefix}${baseOPS}`;

    if (!helperEnabled) return main;

    const baseHELP = filledHELP ?? String(tHELP(msgKey));
    const helperLine = `${roomPrefix}${baseHELP}`;
    return `${main}\n\nEN: ${helperLine}`;
  };

  const openWhatsApp = (to?: string, message = "", showClosedWarning = false) => {
    const target = String(to || contact.reception?.whatsapp || "").trim();

    if (!target) {
      window.alert("липсва WhatsApp номер за контакт");
      return;
    }

    if (showClosedWarning) window.alert(closedMsg);
    window.location.href = buildWhatsAppLink(target, message);
  };

  const getDeptWhatsapp = (dept: DepartmentKey | "reception") =>
    String(contact?.[dept]?.whatsapp || contact?.reception?.whatsapp || "").trim();

  const getDeptPhone = (dept: DepartmentKey | "reception") =>
    String(contact?.[dept]?.phone || contact?.reception?.phone || "").trim();

  const askAI = async () => {
    if (!aiQ.trim()) return;

    try {
      setAiLoading(true);

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: aiQ,
          lang: String(lang),
          hotel: {
            hotelName: config.hotelName,
            locationQuery: config.location?.query,
            wifi: config.wifi,
            departmentHours: config.departmentHours,
          },
        }),
      });

      const data = await res.json();

      if (!data?.ok) {
        setAiAnswer("Грешка при обработка.");
        return;
      }

      const dept = data.department ?? "reception";
      const opsMsg = data.opsMessageBG ?? aiQ;
      const routed = warnAndRouteIfClosed(dept as any);
      const finalDept = routed.dept ?? "reception";

      let to = contact.reception.whatsapp;
      if (finalDept === "housekeeping") to = contact.housekeeping.whatsapp;
      if (finalDept === "maintenance") to = contact.maintenance.whatsapp;
      if (finalDept === "restaurant") to = contact.restaurant.whatsapp;
      if (finalDept === "events") to = contact.events.whatsapp;

      openWhatsApp(to, `${roomPrefix}${opsMsg}`, routed.warned);
      setAiAnswer(data.uiReply || "Изпратено.");
      setAiQ("");
    } catch {
      setAiAnswer("Сървърна грешка.");
    } finally {
      setAiLoading(false);
    }
  };

  const sendReception = (msgKey: string) => {
    const routed = warnAndRouteIfClosed("reception");
    openWhatsApp(getDeptWhatsapp("reception"), buildStaffMessage(msgKey), routed.warned);
  };

  const sendHousekeeping = (msgKey: string) => {
    const routed = warnAndRouteIfClosed("housekeeping");
    const to = routed.dept === "reception" ? getDeptWhatsapp("reception") : getDeptWhatsapp("housekeeping");
    openWhatsApp(to, buildStaffMessage(msgKey), routed.warned);
  };

  const sendMaintenance = (msgKey: string) => {
    const routed = warnAndRouteIfClosed("maintenance");
    const to = routed.dept === "reception" ? getDeptWhatsapp("reception") : getDeptWhatsapp("maintenance");
    openWhatsApp(to, buildStaffMessage(msgKey), routed.warned);
  };

  const sendEvents = (msgKey: string) => {
    const routed = warnAndRouteIfClosed("events");
    const to = routed.dept === "reception" ? getDeptWhatsapp("reception") : getDeptWhatsapp("events");
    openWhatsApp(to, buildStaffMessage(msgKey), routed.warned);
  };

  const sendRestaurant = (msgKey: string) => {
    const routed = warnAndRouteIfClosed("restaurant");
    const to = routed.dept === "reception" ? getDeptWhatsapp("reception") : getDeptWhatsapp("restaurant");
    openWhatsApp(to, buildStaffMessage(msgKey), routed.warned);
  };

  void sendRestaurant;

  type AiDept = "reception" | "housekeeping" | "maintenance" | "restaurant" | "events";

  const deptToWhatsApp = (dept: AiDept) => {
    switch (dept) {
      case "housekeeping":
        return getDeptWhatsapp("housekeeping");
      case "maintenance":
        return getDeptWhatsapp("maintenance");
      case "restaurant":
        return getDeptWhatsapp("restaurant");
      case "events":
        return getDeptWhatsapp("events");
      default:
        return getDeptWhatsapp("reception");
    }
  };

  const sendAIRequest = async (q: string) => {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: q,
        lang: String(lang),
        hotel: {
          hotelName: config.hotelName,
          locationQuery: config.location?.query,
          wifi: config.wifi,
          departmentHours: config.departmentHours,
        },
      }),
    });

    const data = (await res.json()) as {
      ok: boolean;
      department?: AiDept;
      opsMessageBG?: string;
      uiReply?: string;
    };

    const dept = (data.department ?? "reception") as AiDept;
    const opsMsg = String(data.opsMessageBG ?? q);
    const uiReply = String(data.uiReply ?? "");

    const routed = warnAndRouteIfClosed(dept as any);
    const finalDept = (routed.dept ?? "reception") as AiDept;
    const to = finalDept === "reception" ? contact.reception.whatsapp : deptToWhatsApp(finalDept);

    openWhatsApp(to, `${roomPrefix}${opsMsg}`, routed.warned);
    return uiReply;
  };

  void sendAIRequest;

  const sendVenueReservation = (venue: VenueRow) => {
  const venueName = venue?.name || "";

  const people = (window.prompt(String(tUI("prompt_people") || "Брой хора:"), "4") || "").trim();
  if (!people) return;

  let date: string | null = null;

  while (!date) {
    date = askRequired(
      String(tUI("prompt_date")),
      String(tUI("example_date")),
      reDate,
      String(tUI("invalid_date"))
    );
    if (date === null) return;
  }

  const m = reDate.exec(date);
  if (!m) return;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);

  const picked = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
  const today = new Date();
  const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);

  if (
    picked.getFullYear() !== yyyy ||
    picked.getMonth() !== mm - 1 ||
    picked.getDate() !== dd
  ) {
    alert(String(tUI("invalid_date")));
    return;
  }

  if (picked < today0) {
    alert(String(tUI("invalid_date")));
    return;
  }

  const isTimeWithinVenueHours = (value: string, open?: string, close?: string) => {
  if (!open || !close) return true;

  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const current = toMinutes(value);
  const start = toMinutes(open);
  const end = toMinutes(close);

  return current >= start && current <= end;
};

let time: string | null = null;

while (!time) {
  const pickedTime = askRequired(
    String(tUI("prompt_time")),
    String(tUI("example_time")),
    reTime,
    String(tUI("invalid_time"))
  );

  if (!pickedTime) return;

  if (venue?.open && venue?.close) {
    const ok = isTimeWithinVenueHours(pickedTime, venue.open, venue.close);

    if (!ok) {
      const hoursLabel = venue.hours || `${venue.open} - ${venue.close}`;

      alert(
        `${String(tUI("invalid_reservation_time") || "Избраният час е извън работното време.")}\n` +
        `${String(tUI("reservation_outside_hours") || "Работното време е: {hours}").replace("{hours}", hoursLabel)}`
      );
      continue;
    }
  }

  time = pickedTime;
}

  const noOccasion = window.confirm(
    String(
      tUI("confirm_no_occasion") ||
        "Има ли повод?\nOK = Без повод\nCancel = Ще напиша повод"
    )
  );

  let occasion = "";
  if (noOccasion) {
    occasion = String(tUI("no_occasion") || "Без повод");
  } else {
    occasion = (
      window.prompt(
        String(tUI("prompt_occasion") || "Повод (напр. рожден ден):"),
        "Birthday"
      ) || ""
    ).trim();

    if (!occasion) occasion = String(tUI("no_occasion") || "Без повод");
  }

  const opsMsg =
    `${String(tOPS("restaurant_label") || "Outlet")}: ${venueName}\n` +
    `${String(tOPS("label_people") || "Брой хора")}: ${people}\n` +
    `${String(tOPS("label_date") || "Дата")}: ${date}\n` +
    `${String(tOPS("label_time") || "Час")}: ${time}\n` +
    `${String(tOPS("label_occasion") || "Повод")}: ${occasion}`;

  const helpMsg =
    `Outlet: ${venueName}\n` +
    `People: ${people}\n` +
    `Date: ${date}\n` +
    `Time: ${time}\n` +
    `Occasion: ${occasion}`;

  const msg = helperEnabled
    ? `${roomPrefix}${opsMsg}\n\nEN: ${roomPrefix}${helpMsg}`
    : `${roomPrefix}${opsMsg}`;

  const type = String(venue.reservationType || "").trim().toLowerCase();

  if (type === "url" && venue.reservationUrl) {
    window.open(String(venue.reservationUrl), "_blank", "noopener,noreferrer");
    return;
  }

  if (type === "phone" && venue.reservationPhone) {
    const phone = String(venue.reservationPhone || "").trim();
    if (!phone) return;
    window.location.href = safeTelLink(phone);
    return;
  }

  if (type === "email" && venue.reservationEmail) {
    const subject = encodeURIComponent(`${config.hotelName} - ${venueName} reservation`);
    const body = encodeURIComponent(msg);
    window.location.href = `mailto:${venue.reservationEmail}?subject=${subject}&body=${body}`;
    return;
  }

  if (type === "whatsapp" && venue.reservationWhatsapp) {
    const wa = String(venue.reservationWhatsapp || "").trim();
    if (!wa) return;
    window.location.href = buildWhatsAppLink(wa, msg);
    return;
  }

  // fallback към restaurant department
  const routed = warnAndRouteIfClosed("restaurant");
  const to =
    routed.dept === "reception"
      ? getDeptWhatsapp("reception")
      : getDeptWhatsapp("restaurant");

  openWhatsApp(to, msg, routed.warned);
};

  const openVenueReservation = (venue: VenueRow) => {
  const type = String(venue.reservationType || "").trim().toLowerCase();

  if (type === "none") return;

  // outlets, които минават през формата
  const usesReservationForm =
    type === "whatsapp" ||
    type === "email" ||
    type === "phone";

  if (usesReservationForm) {
    sendVenueReservation(venue);
    return;
  }

  if (type === "url" && venue.reservationUrl) {
    window.open(String(venue.reservationUrl), "_blank", "noopener,noreferrer");
    return;
  }

  // fallback
  sendVenueReservation(venue);
};

  const housekeepingTitle = tUI("housekeeping_title");
  const housekeepingTitleAfter = tUI("housekeeping_title_after");
  const housekeepingAfterNote = tUI("housekeeping_after_note");

  const sections: HubSection[] = [
    {
      id: "wifi",
      title: tUI("wifi_title"),
      items: [
        {
          label: tUI("wifi_show"),
          kind: "info",
          info: `${tUI("wifi_network")}: ${config.wifi.ssid}\n${tUI("wifi_password")}: ${config.wifi.password}`,
        },
      ],
    },
    {
      id: "reception",
      title: tUI("reception_title"),
      items: [
        { label: tUI("late_checkout"), kind: "link", onClick: () => sendReception("msg_late_checkout") },
        { label: tUI("taxi"), kind: "link", onClick: () => sendReception("msg_taxi") },
        { label: tUI("wake_up"), kind: "link", onClick: () => sendReception("msg_wakeup") },
        { label: "🚗 Uber", kind: "link", href: uberUrl, newTab: true },
      ],
    },
    {
      id: "housekeeping",
      title: housekeepingRoutedToReception ? housekeepingTitleAfter : housekeepingTitle,
      subtitle: housekeepingRoutedToReception ? housekeepingAfterNote : undefined,
      items: [
        { label: tUI("towels"), kind: "link", onClick: () => sendHousekeeping("msg_towels") },
        { label: tUI("toilet_paper"), kind: "link", onClick: () => sendHousekeeping("msg_toilet_paper") },
        { label: tUI("room_cleaning"), kind: "link", onClick: () => sendHousekeeping("msg_room_cleaning") },
        { label: tUI("extra_pillows"), kind: "link", onClick: () => sendHousekeeping("msg_extra_pillows") },
        ...hkExtras.map((x) => ({
          label: tUI(x.labelKey),
          kind: "link" as const,
          onClick: () => sendHousekeeping(x.messageKey),
        })),
      ],
    },
    {
      id: "maintenance",
      title: tUI("maintenance_title"),
      items: [
        { label: tUI("ac_issue"), kind: "link", onClick: () => sendMaintenance("msg_ac_issue") },
        { label: tUI("water_issue"), kind: "link", onClick: () => sendMaintenance("msg_water_issue") },
        { label: tUI("coffee_machine"), kind: "link", onClick: () => sendMaintenance("msg_coffee_machine") },
        { label: tUI("something_broken"), kind: "link", onClick: () => sendMaintenance("msg_something_broken") },
      ],
    },
    ...(outletsSection ? [outletsSection] : []),
    ...(!outletsSection
      ? [
          {
            id: "activities",
            title: tUI("activities_title"),
            items: [
              { label: tUI("hotel_events"), kind: "link" as const, onClick: () => sendEvents("msg_events") },
              { label: tUI("kids_program"), kind: "link" as const, onClick: () => sendEvents("msg_kids") },
            ],
          },
        ]
      : []),
    {
      id: "explore",
      title: tUI("explore_title"),
      items: [
        {
          label: tUI("attractions_nearby"),
          kind: "link",
          href: `https://www.google.com/maps/search/${encodeURIComponent("attractions near " + config.location.query)}`,
          newTab: true,
        },
        {
          label: tUI("restaurants_nearby"),
          kind: "link",
          href: `https://www.google.com/maps/search/${encodeURIComponent("restaurants near " + config.location.query)}`,
          newTab: true,
        },
        {
          label: tUI("pharmacy"),
          kind: "link",
          href: `https://www.google.com/maps/search/${encodeURIComponent("pharmacy near " + config.location.query)}`,
          newTab: true,
        },
      ],
    },
    {
      id: "reviews",
      title: tUI("reviews_title"),
      items: [
        ...(config.reviews.google
          ? [{ label: tUI("leave_google_review"), kind: "link" as const, href: config.reviews.google, newTab: true }]
          : []),
        ...(config.reviews.tripadvisor
          ? [{ label: tUI("leave_tripadvisor_review"), kind: "link" as const, href: config.reviews.tripadvisor, newTab: true }]
          : []),
      ],
    },
    {
      id: "ai",
      title: "🤖 " + tUI("ai_title"),
      items: [
        {
          label: tUI("ai_open"),
          kind: "custom",
        } as any,
      ],
    },
    {
      id: "emergency",
      title: "🚨 " + tUI("emergency_title"),
      items: [
        {
          label: tUI("emergency_call"),
          kind: "link",
          href: safeTelLink(getDeptPhone("reception")),
        },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-md">
      <div className="relative">
        <div className="relative h-[220px] sm:h-[260px] md:h-[300px] w-full overflow-hidden bg-neutral-800">
          <img
            src={config.coverImage}
            alt={config.hotelName}
            className="h-full w-full object-cover"
            style={{ objectPosition: config.coverImagePosition || "center center" }}
          />
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-neutral-950/20 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold leading-tight">{config.hotelName}</h1>
              <p className="mt-1 text-sm text-neutral-200">{tUI("hero_subtitle")}</p>

              {room ? (
                <div className="mt-2 inline-flex rounded-full bg-neutral-900/70 px-3 py-1 text-xs font-semibold text-neutral-100 ring-1 ring-neutral-700">
                  Room {room}
                </div>
              ) : null}
            </div>

            <select
              value={String(lang)}
              onChange={(e) => setLang(e.target.value as LangKey)}
              className="rounded-xl bg-neutral-900/70 px-3 py-2 text-sm text-neutral-100 outline-none ring-1 ring-neutral-700"
              aria-label="Language"
            >
              {config.languages.map((l) => (
                <option key={String(l)} value={String(l)}>
                  {String(l).toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="px-4 mt-3">
        <InstallAppButton label={String(tUI("install_app") || "Инсталирай приложението")} />
      </div>

      <div className="p-4 pb-10">
        <div className="space-y-3">
          {sections.map((sec) =>
            sec.id === "outlets" ? (
              <OutletsAccordion
                key={sec.id}
                section={sec}
                groups={groupedOutlets}
                tUI={tUI}
                onReserve={openVenueReservation}
              />
            ) : (
              <Accordion
                key={sec.id}
                section={sec}
                tUI={tUI}
                aiQ={aiQ}
                setAiQ={setAiQ}
                aiA={aiAnswer}
                aiLoading={aiLoading}
                askAI={askAI}
              />
            )
          )}
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400">{tUI("notice")}</p>
      </div>
    </div>
  );
}

// REPLACE FROM: function Accordion({ ... }) { ... }
// AND PUT THIS WHOLE BLOCK AT THE END OF GuestHub.tsx

function Accordion({
  section,
  tUI,
  aiQ,
  setAiQ,
  aiA,
  aiLoading,
  askAI,
}: {
  section: HubSection;
  tUI: (k: string) => any;
  aiQ: string;
  setAiQ: (v: string) => void;
  aiA: string;
  aiLoading: boolean;
  askAI: () => void;
}) {
  const [open, setOpen] = useState(false);

  const accentBg = "bg-[#9B86BD]";
  const accentText = "text-[#0D1B2A]";
  const accentRing = "ring-1 ring-[#9B86BD]/35";

  return (
    <div className="rounded-2xl overflow-hidden ring-1 ring-neutral-800 bg-neutral-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "w-full px-4 py-4 text-left",
          accentBg,
          accentText,
          accentRing,
          "flex items-center justify-between gap-3"
        )}
      >
        <div>
          <div className="text-base font-semibold">{section.title}</div>
          {section.subtitle ? (
            <div className="mt-1 text-xs font-medium text-[#0D1B2A]/80">
              {section.subtitle}
            </div>
          ) : null}
        </div>
        <div className="text-lg">▾</div>
      </button>

      {open ? (
        <div className="px-4 py-4 bg-neutral-950/40">
          <div className="grid grid-cols-1 gap-2">
            {section.id === "ai" ? (
              <div className="grid grid-cols-1 gap-2">
                <textarea
                  value={aiQ}
                  onChange={(e) => setAiQ(e.target.value)}
                  placeholder={String(tUI("ai_placeholder") || "Попитай нещо за хотела...")}
                  className="min-h-[90px] w-full rounded-xl bg-neutral-900/60 p-3 text-sm text-neutral-100 ring-1 ring-neutral-800 outline-none"
                />
                <button
                  type="button"
                  onClick={askAI}
                  disabled={aiLoading || !aiQ.trim()}
                  className={clsx(
                    "rounded-xl px-3 py-3 text-left text-sm font-semibold",
                    "bg-[#9B86BD]/14 ring-1 ring-[#9B86BD]/25 text-white",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "hover:bg-[#9B86BD]/20 active:scale-[0.99] transition"
                  )}
                >
                  {aiLoading
                    ? String(tUI("ai_loading") || "Мисля...")
                    : String(tUI("ai_send") || "Изпрати")}
                </button>

                {aiA ? (
                  <div className="whitespace-pre-wrap rounded-xl bg-neutral-900/60 p-3 text-sm text-neutral-100 ring-1 ring-neutral-800">
                    {aiA}
                  </div>
                ) : null}
              </div>
            ) : section.items.length ? (
              section.items.map((it, idx) => {
                if (it.kind === "info") {
                  return (
                    <pre
                      key={idx}
                      className="whitespace-pre-wrap rounded-xl bg-neutral-900/60 p-3 text-sm text-neutral-100 ring-1 ring-neutral-800"
                    >
                      {it.info}
                    </pre>
                  );
                }

                if (it.kind === "link" && it.onClick) {
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={it.onClick}
                      className="rounded-xl px-3 py-3 text-left text-sm font-semibold bg-[#9B86BD]/14 ring-1 ring-[#9B86BD]/25 text-white hover:bg-[#9B86BD]/20 active:scale-[0.99] transition"
                    >
                      {it.label}
                    </button>
                  );
                }

                if (it.kind === "link" && it.href) {
                  return (
                    <a
                      key={idx}
                      href={it.href}
                      target={it.newTab || it.href.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                      className="rounded-xl px-3 py-3 text-sm font-semibold bg-[#9B86BD]/14 ring-1 ring-[#9B86BD]/25 text-white hover:bg-[#9B86BD]/20 active:scale-[0.99] transition"
                    >
                      {it.label}
                    </a>
                  );
                }

                return (
                  <div
                    key={idx}
                    className="rounded-xl bg-neutral-900/60 p-3 text-sm text-neutral-300 ring-1 ring-neutral-800"
                  >
                    {it.label}
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-neutral-300">(Няма опции)</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OutletsAccordion({
  section,
  groups,
  tUI,
  onReserve,
}: {
  section: HubSection;
  groups: Array<{
    category: string;
    meta: { title: string; icon: string };
    venues: VenueRow[];
  }>;
  tUI: (k: string) => any;
  onReserve: (venue: VenueRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openVenue, setOpenVenue] = useState<string | null>(null);

  return (
    <div className="rounded-2xl overflow-hidden ring-1 ring-neutral-800 bg-neutral-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-4 text-left bg-[#9B86BD] text-[#0D1B2A] ring-1 ring-[#9B86BD]/35 flex items-center justify-between gap-3"
      >
        <div className="text-base font-semibold">{section.title}</div>
        <div className="text-lg">▾</div>
      </button>

      {open ? (
        <div className="px-4 py-4 bg-neutral-950/40">
          <div className="space-y-3">
            {groups.map((group) => {
              const catKey = group.category;
              const catOpen = openCategory === catKey;

              return (
                <div
                  key={catKey}
                  className="rounded-2xl bg-neutral-900/50 ring-1 ring-neutral-800 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenCategory(catOpen ? null : catKey);
                      setOpenVenue(null);
                    }}
                    className="w-full px-3 py-3 text-left flex items-center justify-between gap-3 bg-neutral-900/70"
                  >
                    <div className="font-semibold text-white">
                      {group.meta.icon} {getCategoryDisplayTitle(catKey, tUI)}
                    </div>
                    <div className="text-neutral-300">▾</div>
                  </button>

                  {catOpen ? (
                    <div className="p-3 space-y-2">
                      {group.venues.map((venue, idx) => {
                        const venueKey = `${catKey}-${venue.name}-${idx}`;
                        const venueOpen = openVenue === venueKey;
                        const hoursText =
                          venue.hours ||
                          (venue.open || venue.close
                            ? `${venue.open || "?"} - ${venue.close || "?"}`
                            : "");

                        return (
                          <div
                            key={venueKey}
                            className="rounded-xl overflow-hidden ring-1 ring-neutral-800 bg-neutral-950/50"
                          >
                            <button
                              type="button"
                              onClick={() => setOpenVenue(venueOpen ? null : venueKey)}
                              className="w-full px-3 py-3 text-left flex items-center justify-between gap-3"
                            >
                              <div>
                                <div className="font-semibold text-white">{venue.name}</div>
                                {venue.shortDescription ? (
                                  <div className="mt-1 text-xs text-neutral-300">
                                    {venue.shortDescription}
                                  </div>
                                ) : null}
                              </div>
                              <div className="text-neutral-300">▾</div>
                            </button>

                            {venueOpen ? (
                              <div className="px-3 pb-3 space-y-2">
                                {venue.description ? (
                                  <div className="rounded-xl bg-neutral-900/60 p-3 text-sm text-neutral-100 ring-1 ring-neutral-800">
                                    {venue.description}
                                  </div>
                                ) : null}

                                {venue.cuisine ? (
                                  <div className="rounded-xl bg-neutral-900/60 p-3 text-sm text-neutral-100 ring-1 ring-neutral-800">
                                    <span className="font-semibold">
                                      {String(tUI("cuisine") || "Cuisine")}:
                                    </span>{" "}
                                    {venue.cuisine}
                                  </div>
                                ) : null}

                                {hoursText ? (
                                  <div className="rounded-xl bg-neutral-900/60 p-3 text-sm text-neutral-100 ring-1 ring-neutral-800">
                                    <span className="font-semibold">
                                      {String(tUI("hours") || "Hours")}:
                                    </span>{" "}
                                    {hoursText}
                                  </div>
                                ) : null}

                                {venue.location ? (
                                  <div className="rounded-xl bg-neutral-900/60 p-3 text-sm text-neutral-100 ring-1 ring-neutral-800">
                                    <span className="font-semibold">
                                      {String(tUI("location") || "Location")}:
                                    </span>{" "}
                                    {venue.location}
                                  </div>
                                ) : null}

                                {venue.ageGroup ? (
                                  <div className="rounded-xl bg-neutral-900/60 p-3 text-sm text-neutral-100 ring-1 ring-neutral-800">
                                    <span className="font-semibold">
                                      {String(tUI("age_group") || "Age group")}:
                                    </span>{" "}
                                    {venue.ageGroup}
                                  </div>
                                ) : null}

                                {venue.programText ? (
                                  <div className="rounded-xl bg-neutral-900/60 p-3 text-sm text-neutral-100 ring-1 ring-neutral-800">
                                    <span className="font-semibold">
                                      {String(tUI("program") || "Program")}:
                                    </span>{" "}
                                    {venue.programText}
                                  </div>
                                ) : null}

                                <div className="grid grid-cols-1 gap-2 pt-1">
                                  {venue.menuUrl ? (
                                    <a
                                      href={venue.menuUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-xl px-3 py-3 text-sm font-semibold bg-[#9B86BD]/14 ring-1 ring-[#9B86BD]/25 text-white hover:bg-[#9B86BD]/20 transition"
                                    >
                                      {String(tUI("view_menu_pdf") || "View menu")}
                                    </a>
                                  ) : null}

                                  {venue.programUrl ? (
                                    <a
                                      href={venue.programUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-xl px-3 py-3 text-sm font-semibold bg-[#9B86BD]/14 ring-1 ring-[#9B86BD]/25 text-white hover:bg-[#9B86BD]/20 transition"
                                    >
                                      {String(tUI("view_program") || "View program")}
                                    </a>
                                  ) : null}

                                  {String(venue.reservationType || "").toLowerCase() !== "none" &&
                                  (venue.reservationType ||
                                    venue.reservationUrl ||
                                    venue.reservationPhone ||
                                    venue.reservationWhatsapp ||
                                    venue.reservationEmail ||
                                    venue.requiresReservation) ? (
                                    <button
                                      type="button"
                                      onClick={() => onReserve(venue)}
                                      className="rounded-xl px-3 py-3 text-left text-sm font-semibold bg-[#9B86BD]/14 ring-1 ring-[#9B86BD]/25 text-white hover:bg-[#9B86BD]/20 active:scale-[0.99] transition"
                                    >
                                      {venue.reservationLabel ||
                                        String(tUI("reserve_now") || "Reserve")}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
