"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { HotelConfig, LangKey, HubSection, DepartmentKey } from "@/lib/types";
import {
  buildWhatsAppLink,
  isAfterCutoffLocal,
  isWithinHoursLocal,
  fillBlanks,
  safeTelLink,
} from "@/lib/utils";

function clsx(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

const reDate = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(\d{4})$/; // DD.MM.YYYY
const reTime = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM

function askRequired(label: string, example: string, re: RegExp, invalidMsg: string) {
  while (true) {
    const v = (window.prompt(label, example) || "").trim(); // example = "placeholder"
    if (!v) return null; // cancel
    if (re.test(v)) return v;
    window.alert(invalidMsg);
  }
}

export default function GuestHub({ config }: { config: HotelConfig }) {
  const [lang, setLang] = useState<LangKey>(config.languageDefault ?? "en");

  const [aiQ, setAiQ] = useState("");
  const [aiA, setAiA] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);

  const sp = useSearchParams();
  const room = sp.get("room") || "";

  // UI language (guest)
  const tUI = (key: string) => config.i18n?.[String(lang)]?.[key] ?? key;

  // Ops language (staff WhatsApp)
  const opsLang = (config.opsLanguage ?? "bg") as LangKey;
  const tOPS = (key: string) => config.i18n?.[String(opsLang)]?.[key] ?? key;

  // Helper language (optional, e.g. EN)
  const helperEnabled = Boolean(config.staffHelperEnabled);
  const helperLang = (config.staffHelperLanguage ?? "en") as LangKey;
  const tHELP = (key: string) => config.i18n?.[String(helperLang)]?.[key] ?? key;

  // Keep "Room" neutral (can be translated later if you want)
  const roomPrefix = room ? `Room ${room} - ` : "";

  const contact = config.contacts;

  // Department hours logic
  const deptHours = config.departmentHours ?? {};

  const isDeptOpen = (dept: DepartmentKey) => {
    const h = deptHours?.[dept];
    if (!h?.open || !h?.close) return true; // if not configured -> always open
    return isWithinHoursLocal(h.open, h.close);
  };

  const warnAndRouteIfClosed = (dept: DepartmentKey) => {
    if (isDeptOpen(dept)) return { dept, warned: false };
    return { dept: "reception" as const, warned: true };
  };

  const closedMsg =
    (tUI("dept_closed_to_reception") as string) ||
    "Отделът не работи в момента. Заявката ще бъде изпратена към рецепция.";

  // Legacy housekeeping cutoff (fallback if hours are not set)
  const afterCutoffLegacy = useMemo(() => {
    return isAfterCutoffLocal(config.housekeepingCutoff ?? "17:00");
  }, [config.housekeepingCutoff]);

  // HK routing priority: departmentHours.housekeeping if exists, else legacy cutoff
  const housekeepingRoutedToReception =
    deptHours.housekeeping?.open && deptHours.housekeeping?.close
      ? !isDeptOpen("housekeeping")
      : afterCutoffLegacy;

  // Extras (standard)
  const hkExtras =
    // @ts-expect-error optional field not in types yet
    (config.housekeepingExtras as Array<{ key: string; labelKey: string; messageKey: string }> | undefined) ??
    [
      { key: "laundry", labelKey: "laundry", messageKey: "msg_laundry" },
      { key: "iron", labelKey: "iron", messageKey: "msg_iron" },
      { key: "minibar", labelKey: "minibar", messageKey: "msg_minibar" },
      { key: "blanket", labelKey: "blanket", messageKey: "msg_blanket" },
    ];

  // Taxi providers (keep taxi + optional Uber link)
  const taxiProviders = config.taxiProviders ?? [];
  const uberUrl =
    taxiProviders.find((p) => (p.name || "").toLowerCase() === "uber")?.url ?? "https://m.uber.com/";

  // Build WhatsApp message in ops language + optional helper line
  const buildStaffMessage = (msgKey: string, filledOPS?: string, filledHELP?: string) => {
    const baseOPS = filledOPS ?? String(tOPS(msgKey));
    const main = `${roomPrefix}${baseOPS}`;

    if (!helperEnabled) return main;

    const baseHELP = filledHELP ?? String(tHELP(msgKey));
    const helperLine = `${roomPrefix}${baseHELP}`;
    return `${main}\n\nEN: ${helperLine}`;
  };

  const openWhatsApp = (to: string, message: string, showClosedWarning: boolean) => {
    if (showClosedWarning) window.alert(closedMsg);
    window.location.href = buildWhatsAppLink(to, message);
  };

  const askAI = async () => {
    const q = aiQ.trim();
    if (!q) return;

    setAiLoading(true);
    setAiA("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          hotel: {
            hotelName: config.hotelName,
            locationQuery: config.location?.query,
            wifi: config.wifi,
            departmentHours: config.departmentHours,
          },
        }),
      });

      const data = await res.json();
      setAiA(String(data.answer || data.error || "Error"));
    } catch {
      setAiA(String(tUI("ai_error") || "Грешка. Опитай пак."));
    } finally {
      setAiLoading(false);
    }
  };

  // ---- Actions (with routing + validation) ----
  const sendReception = (msgKey: string) => {
    const routed = warnAndRouteIfClosed("reception");
    openWhatsApp(contact.reception.whatsapp, buildStaffMessage(msgKey), routed.warned);
  };

  const sendHousekeeping = (msgKey: string) => {
    const routed = warnAndRouteIfClosed("housekeeping");
    const to = routed.dept === "reception" ? contact.reception.whatsapp : contact.housekeeping.whatsapp;
    openWhatsApp(to, buildStaffMessage(msgKey), routed.warned);
  };

  const sendMaintenance = (msgKey: string) => {
    const routed = warnAndRouteIfClosed("maintenance");
    const to = routed.dept === "reception" ? contact.reception.whatsapp : contact.maintenance.whatsapp;
    openWhatsApp(to, buildStaffMessage(msgKey), routed.warned);
  };

  const sendEvents = (msgKey: string) => {
    const routed = warnAndRouteIfClosed("events");
    const to = routed.dept === "reception" ? contact.reception.whatsapp : contact.events.whatsapp;
    openWhatsApp(to, buildStaffMessage(msgKey), routed.warned);
  };

  const sendRestaurant = (msgKey: string) => {
    const routed = warnAndRouteIfClosed("restaurant");
    const to = routed.dept === "reception" ? contact.reception.whatsapp : contact.restaurant.whatsapp;
    openWhatsApp(to, buildStaffMessage(msgKey), routed.warned);
  };

  // ✅ Restaurant reservation: CLEAN structured message (no template, no fillBlanks)
const sendRestaurantReservation = () => {
  const people = (window.prompt(String(tUI("prompt_people") || "Брой хора:"), "4") || "").trim();
  if (!people) return;

  const date = askRequired(
    String(tUI("prompt_date")),
    String(tUI("example_date")),
    reDate,
    String(tUI("invalid_date"))
  );
  if (!date) return;

  const time = askRequired(
    String(tUI("prompt_time")),
    String(tUI("example_time")),
    reTime,
    String(tUI("invalid_time"))
  );
  if (!time) return;

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
    occasion = (window.prompt(String(tUI("prompt_occasion") || "Повод (напр. рожден ден):"), "Birthday") || "").trim();
    if (!occasion) occasion = String(tUI("no_occasion") || "Без повод");
  }

  // ✅ FINAL MESSAGE (NO OLD TEMPLATE ANYWHERE)
  const opsMsg =
    `${String(tOPS("label_people") || "Брой хора")}: ${people}\n` +
    `${String(tOPS("label_date") || "Дата")}: ${date}\n` +
    `${String(tOPS("label_time") || "Час")}: ${time}\n` +
    `${String(tOPS("label_occasion") || "Повод")}: ${occasion}`;

  const helpMsg =
    `People: ${people}\n` +
    `Date: ${date}\n` +
    `Time: ${time}\n` +
    `Occasion: ${occasion}`;

  const msg = helperEnabled
    ? `${roomPrefix}${opsMsg}\n\nEN: ${roomPrefix}${helpMsg}`
    : `${roomPrefix}${opsMsg}`;

  const routed = warnAndRouteIfClosed("restaurant");
  const to = routed.dept === "reception" ? contact.reception.whatsapp : contact.restaurant.whatsapp;
  openWhatsApp(to, msg, routed.warned);
};

  // Titles/subtitles for housekeeping in UI
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
    {
      id: "restaurant",
      title: tUI("restaurant_title"),
      items: [
        { label: tUI("reserve_table"), kind: "link", onClick: () => sendRestaurantReservation() },
        { label: tUI("allergens"), kind: "link", onClick: () => sendRestaurant("msg_allergens") },
        { label: tUI("themed_night"), kind: "link", onClick: () => sendRestaurant("msg_themed_night") },
        { label: tUI("room_service"), kind: "link", onClick: () => sendRestaurant("msg_room_service") },
      ],
    },
    {
      id: "activities",
      title: tUI("activities_title"),
      items: [
        { label: tUI("hotel_events"), kind: "link", onClick: () => sendEvents("msg_events") },
        { label: tUI("kids_program"), kind: "link", onClick: () => sendEvents("msg_kids") },
      ],
    },
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
          href: safeTelLink(contact.reception.phone),
        },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-md">
      {/* Cover */}
      <div className="relative">
        <div className="aspect-[16/9] w-full overflow-hidden bg-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={config.coverImage} alt={config.hotelName} className="h-full w-full object-cover" />
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

      {/* Sections */}
      <div className="p-4 pb-10">
        <div className="space-y-3">
          {sections.map((sec) => (
            <Accordion
              key={sec.id}
              section={sec}
              tUI={tUI}
              aiQ={aiQ}
              setAiQ={setAiQ}
              aiA={aiA}
              aiLoading={aiLoading}
              askAI={askAI}
            />
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400">{tUI("notice")}</p>
      </div>
    </div>
  );
}

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

  // ✅ Lavender theme tokens (same as marketing page)
  const accentBg = "bg-[#9B86BD]";
  const accentText = "text-[#0D1B2A]";
  const accentRing = "ring-1 ring-[#9B86BD]/35";

  const accentSoft = "bg-[#9B86BD]/14";
  const accentSoftRing = "ring-1 ring-[#9B86BD]/25";

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
            <div className="mt-1 text-xs font-medium text-[#0D1B2A]/80">{section.subtitle}</div>
          ) : null}
        </div>

        {/* ✅ Arrow always down */}
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
                  {aiLoading ? String(tUI("ai_loading") || "Мисля...") : String(tUI("ai_send") || "Изпрати")}
                </button>

                {aiA ? (
                  <div className="whitespace-pre-wrap rounded-xl bg-neutral-900/60 p-3 text-sm text-neutral-100 ring-1 ring-neutral-800">
                    {aiA}
                  </div>
                ) : null}
              </div>
            ) : section.items.length ? (
              section.items.map((it, idx) =>
                it.kind === "info" ? (
                  <pre
                    key={idx}
                    className="whitespace-pre-wrap rounded-xl bg-neutral-900/60 p-3 text-sm text-neutral-100 ring-1 ring-neutral-800"
                  >
                    {it.info}
                  </pre>
                ) : it.onClick ? (
                  <button
                    key={idx}
                    type="button"
                    onClick={it.onClick}
                    className="rounded-xl px-3 py-3 text-left text-sm font-semibold bg-[#9B86BD]/14 ring-1 ring-[#9B86BD]/25 text-white hover:bg-[#9B86BD]/20 active:scale-[0.99] transition"
                  >
                    {it.label}
                  </button>
                ) : (
                  <a
                    key={idx}
                    href={it.href}
                    target={it.newTab || (it.href?.startsWith('http') ?? false) ? "_blank" : undefined}
                    rel="noreferrer"
                    className="rounded-xl px-3 py-3 text-sm font-semibold bg-[#9B86BD]/14 ring-1 ring-[#9B86BD]/25 text-white hover:bg-[#9B86BD]/20 active:scale-[0.99] transition"
                  >
                    {it.label}
                  </a>
                )
              )
            ) : (
              <div className="text-sm text-neutral-300">(Няма опции)</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
