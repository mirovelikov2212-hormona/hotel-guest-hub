"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { HotelConfig, LangKey, HubSection } from "@/lib/types";
import { isAfterCutoffLocal, safeTelLink } from "@/lib/utils"; // махаме buildWhatsAppLink оттук

function clsx(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

/**
 * надежден WhatsApp линк (не разчитаме на utils, за да не губим текста)
 * phone: само цифри или +49..., ще го нормализираме до digits
 */
function waLink(phone: string, message: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const text = encodeURIComponent(message ?? "");
  return `https://wa.me/${digits}?text=${text}`;
}

export default function GuestHub({ config }: { config: HotelConfig }) {
  const [lang, setLang] = useState<LangKey>(config.languageDefault ?? "en");

  const sp = useSearchParams();
  const room = sp.get("room") || "";
  const roomPrefix = room ? `Room ${room} - ` : "";

  const afterCutoff = useMemo(() => {
    return isAfterCutoffLocal(config.housekeepingCutoff ?? "17:00");
  }, [config.housekeepingCutoff]);

  const t = (key: string) => config.i18n?.[lang]?.[key] ?? key;

  const contact = config.contacts;

  const housekeepingTo = afterCutoff
    ? contact.reception.whatsapp
    : contact.housekeeping.whatsapp;

  const hkExtras =
    // @ts-expect-error optional field not in types yet
    (config.housekeepingExtras as
      | Array<{ key: string; labelKey: string; messageKey: string }>
      | undefined) ??
    [
      { key: "laundry", labelKey: "laundry", messageKey: "msg_laundry" },
      { key: "iron", labelKey: "iron", messageKey: "msg_iron" },
      { key: "minibar", labelKey: "minibar", messageKey: "msg_minibar" },
      { key: "blanket", labelKey: "blanket", messageKey: "msg_blanket" },
    ];

  const taxiProviders =
    // @ts-expect-error optional field not in types yet
    (config.taxiProviders as
      | Array<{ name: string; phone?: string; url?: string }>
      | undefined) ?? [];

  const uberUrl =
    taxiProviders.find((p) => (p.name || "").toLowerCase() === "uber")?.url ??
    "https://m.uber.com/";

  const sections: HubSection[] = [
    {
      id: "wifi",
      title: t("wifi_title"),
      items: [
        {
          label: t("wifi_show"),
          kind: "info",
          info: `${t("wifi_network")}: ${config.wifi.ssid}\n${t(
            "wifi_password"
          )}: ${config.wifi.password}`,
        },
      ],
    },
    {
      id: "reception",
      title: t("reception_title"),
      items: [
        {
          label: t("call_reception"),
          kind: "link",
          href: safeTelLink(contact.reception.phone),
        },
        {
          label: t("late_checkout"),
          kind: "link",
          href: waLink(
            contact.reception.whatsapp,
            roomPrefix + t("msg_late_checkout")
          ),
        },
        {
          label: t("taxi"),
          kind: "link",
          href: waLink(contact.reception.whatsapp, roomPrefix + t("msg_taxi")),
        },
        {
          label: t("wake_up"),
          kind: "link",
          href: waLink(
            contact.reception.whatsapp,
            roomPrefix + t("msg_wakeup")
          ),
        },
        { label: "🚗 Uber", kind: "link", href: uberUrl },
      ],
    },
    {
      id: "housekeeping",
      title: afterCutoff ? t("housekeeping_title_after") : t("housekeeping_title"),
      subtitle: afterCutoff ? t("housekeeping_after_note") : undefined,
      items: [
        {
          label: t("towels"),
          kind: "link",
          href: waLink(housekeepingTo, roomPrefix + t("msg_towels")),
        },
        {
          label: t("toilet_paper"),
          kind: "link",
          href: waLink(housekeepingTo, roomPrefix + t("msg_toilet_paper")),
        },
        {
          label: t("room_cleaning"),
          kind: "link",
          href: waLink(housekeepingTo, roomPrefix + t("msg_room_cleaning")),
        },
        {
          label: t("extra_pillows"),
          kind: "link",
          href: waLink(housekeepingTo, roomPrefix + t("msg_extra_pillows")),
        },

        // Extra services (laundry, iron, minibar, blanket)
        ...hkExtras.map((x) => ({
          label: t(x.labelKey),
          kind: "link" as const,
          href: waLink(housekeepingTo, roomPrefix + t(x.messageKey)),
        })),

        {
          label: t("something_broken"),
          kind: "link",
          href: waLink(
            contact.maintenance.whatsapp,
            roomPrefix + t("msg_something_broken")
          ),
        },
      ],
    },
    {
      id: "restaurant",
      title: t("restaurant_title"),
      items: [
        {
          label: t("reserve_table"),
          kind: "link",
          href: waLink(
            contact.restaurant.whatsapp,
            roomPrefix + t("msg_reserve_table")
          ),
        },
        {
          label: t("allergens"),
          kind: "link",
          href: waLink(
            contact.restaurant.whatsapp,
            roomPrefix + t("msg_allergens")
          ),
        },
        {
          label: t("themed_night"),
          kind: "link",
          href: waLink(
            contact.restaurant.whatsapp,
            roomPrefix + t("msg_themed_night")
          ),
        },
        {
          label: t("room_service") ?? "🛎 Room service",
          kind: "link",
          href: waLink(
            contact.restaurant.whatsapp,
            roomPrefix +
              (config.i18n?.[lang]?.["msg_room_service"]
                ? t("msg_room_service")
                : "Room service request: ____")
          ),
        },
      ],
    },
    {
      id: "activities",
      title: t("activities_title"),
      items: [
        {
          label: t("hotel_events"),
          kind: "link",
          href: waLink(contact.events.whatsapp, roomPrefix + t("msg_events")),
        },
        {
          label: t("kids_program"),
          kind: "link",
          href: waLink(contact.events.whatsapp, roomPrefix + t("msg_kids")),
        },
      ],
    },
    {
      id: "explore",
      title: t("explore_title"),
      items: [
        {
          label: t("attractions_nearby"),
          kind: "link",
          href: `https://www.google.com/maps/search/${encodeURIComponent(
            "attractions near " + config.location.query
          )}`,
        },
        {
          label: t("restaurants_nearby"),
          kind: "link",
          href: `https://www.google.com/maps/search/${encodeURIComponent(
            "restaurants near " + config.location.query
          )}`,
        },
        {
          label: t("pharmacy"),
          kind: "link",
          href: `https://www.google.com/maps/search/${encodeURIComponent(
            "pharmacy near " + config.location.query
          )}`,
        },
      ],
    },
    {
      id: "reviews",
      title: t("reviews_title"),
      items: [
        ...(config.reviews.google
          ? [
              {
                label: t("leave_google_review"),
                kind: "link" as const,
                href: config.reviews.google,
              },
            ]
          : []),
        ...(config.reviews.tripadvisor
          ? [
              {
                label: t("leave_tripadvisor_review"),
                kind: "link" as const,
                href: config.reviews.tripadvisor,
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-md">
      <div className="relative">
        <div className="aspect-[16/9] w-full overflow-hidden bg-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={config.coverImage}
            alt={config.hotelName}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-neutral-950/20 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold leading-tight">
                {config.hotelName}
              </h1>
              <p className="mt-1 text-sm text-neutral-200">{t("hero_subtitle")}</p>
              {room ? (
                <div className="mt-2 inline-flex rounded-full bg-neutral-900/70 px-3 py-1 text-xs font-semibold text-neutral-100 ring-1 ring-neutral-700">
                  Room {room}
                </div>
              ) : null}
            </div>

            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as LangKey)}
              className="rounded-xl bg-neutral-900/70 px-3 py-2 text-sm text-neutral-100 outline-none ring-1 ring-neutral-700"
              aria-label="Language"
            >
              {config.languages.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2">
            <a
              className={clsx(
                "rounded-2xl px-3 py-3 text-center text-sm font-semibold",
                "bg-neutral-900/70 text-neutral-50 ring-1 ring-neutral-700",
                "active:scale-[0.99] transition"
              )}
              href={safeTelLink(contact.reception.phone)}
            >
              {t("call_reception")}
            </a>
          </div>
        </div>
      </div>

      <div className="p-4 pb-10">
        <div className="space-y-3">
          {sections.map((sec) => (
            <Accordion key={sec.id} section={sec} />
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400">{t("notice")}</p>
      </div>
    </div>
  );
}

function Accordion({ section }: { section: HubSection }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl overflow-hidden ring-1 ring-neutral-800 bg-neutral-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "w-full px-4 py-4 text-left",
          "bg-teal-500 text-neutral-950",
          "flex items-center justify-between gap-3"
        )}
      >
        <div>
          <div className="text-base font-semibold">{section.title}</div>
          {section.subtitle ? (
            <div className="mt-1 text-xs font-medium text-neutral-900/80">
              {section.subtitle}
            </div>
          ) : null}
        </div>
        <div className="text-lg">{open ? "▾" : "▸"}</div>
      </button>

      {open ? (
        <div className="px-4 py-4 bg-neutral-950/40">
          <div className="grid grid-cols-1 gap-2">
            {section.items.length ? (
              section.items.map((it, idx) =>
                it.kind === "info" ? (
                  <pre
                    key={idx}
                    className="whitespace-pre-wrap rounded-xl bg-neutral-900/60 p-3 text-sm text-neutral-100 ring-1 ring-neutral-800"
                  >
                    {it.info}
                  </pre>
                ) : (
                  <a
                    key={idx}
                    href={it.href}
                    target={it.href.startsWith("http") ? "_blank" : undefined}
                    rel="noreferrer"
                    className={clsx(
                      "rounded-xl px-3 py-3 text-sm font-semibold",
                      "bg-neutral-900 text-neutral-50 ring-1 ring-neutral-800",
                      "active:scale-[0.99] transition"
                    )}
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
