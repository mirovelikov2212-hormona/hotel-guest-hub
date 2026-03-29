"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getHotelIdBySlug } from "@/lib/hotels/getHotelIdBySlug";
import { supabase } from "@/lib/supabase";
import { createSupabaseRequest } from "@/lib/staff/supabase-requests";
import type { StaffRequestType, StaffServiceTime, StaffRequestStatus } from "@/lib/staff/types";
import { useSearchParams } from "next/navigation";
import type { HotelConfig, LangKey, HubSection, DepartmentKey, HubItem, RequestDef } from "@/lib/types";
import InstallAppButton from "@/components/InstallAppButton";
import {
  buildWhatsAppLink,
  isAfterCutoffLocal,
  isWithinHoursLocal,
  safeTelLink,
} from "@/lib/utils";
import { getRequestDefText } from "@/lib/request-defs";

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

  const aliasMap: Record<string, string> = {
    restaurant: "restaurants",
    bar: "bars",
    kidsclub: "kids",
    kids_club: "kids",
    fitness: "gym",
    roomservice: "room_service",
  };

  if (aliasMap[raw]) return aliasMap[raw];

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

type StoredGuestRequestRef = {
  id: string;
  room: string;
};

type GuestStatusRow = {
  id: string;
  room_number_snapshot: string | null;
  title: string;
  request_type: StaffRequestType;
  status: StaffRequestStatus;
  created_at: string;
};

type GuestStatusItem = {
  id: string;
  room: string;
  title: string;
  type: StaffRequestType;
  status: StaffRequestStatus;
  createdAt: string;
};

const GUEST_REQUEST_REFS_STORAGE_KEY = "guesthub_guest_request_refs";

function readStoredGuestRequestRefs(): StoredGuestRequestRef[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(GUEST_REQUEST_REFS_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is StoredGuestRequestRef => {
      if (!item || typeof item !== "object") return false;

      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.room === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeStoredGuestRequestRefs(refs: StoredGuestRequestRef[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      GUEST_REQUEST_REFS_STORAGE_KEY,
      JSON.stringify(refs)
    );
  } catch (error) {
    console.error("writeStoredGuestRequestRefs failed", error);
  }
}

function pushStoredGuestRequestRef(
  ref: StoredGuestRequestRef
): StoredGuestRequestRef[] {
  const current = readStoredGuestRequestRefs();

  const next = [ref, ...current.filter((item) => item.id !== ref.id)].slice(
    0,
    20
  );

  writeStoredGuestRequestRefs(next);
  return next;
}

function mapGuestStatusRow(row: GuestStatusRow): GuestStatusItem {
  return {
    id: row.id,
    room: row.room_number_snapshot ?? "",
    title: row.title,
    type: row.request_type,
    status: row.status,
    createdAt: new Date(row.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function getGuestRequestIcon(type: StaffRequestType | string): string {
  switch (String(type || "").trim().toLowerCase()) {
    case "towels":
      return "🧺";
    case "toilet_paper":
      return "🧻";
    case "extra_pillow":
      return "🛏️";
    case "extra_blanket":
      return "🧣";
    case "bathrobe":
      return "🧥";
    case "slippers":
      return "🥿";
    case "baby_cot":
      return "👶";
    case "iron":
      return "🧼";
    case "laundry":
      return "🧺";
    case "room_cleaning_request":
    case "extra_cleaning":
      return "🧹";
    case "minibar":
    case "minibar_refill":
      return "🥤";
    case "late_checkout":
      return "🕒";
    case "wake_up_call":
      return "⏰";
    case "taxi":
      return "🚕";
    case "information":
    case "information_request":
      return "ℹ️";
    case "reservation_help":
    case "restaurant_reservation":
      return "🍽️";
    case "luggage_help":
      return "🧳";
    case "air_conditioning":
      return "❄️";
    case "no_hot_water":
      return "🚿";
    case "tv_issue":
      return "📺";
    case "light_issue":
    case "light_not_working":
      return "💡";
    case "bathroom_issue":
      return "🚽";
    case "door_lock_issue":
      return "🚪";
    case "wifi_issue":
      return "📶";
    case "power_outlet_issue":
      return "🔌";
    case "safe_issue":
      return "🔒";
    case "balcony_door_issue":
      return "🚪";
    case "minibar_not_cooling":
      return "🧊";
    case "other_technical_issue":
      return "🛠️";
    default:
      return "•";
  }
}

function cleanRequestTitle(value: string) {
  return value.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function getRequestDefButtonIcon(def: RequestDef): string {
  const raw = String(def.icon || def.requestType || def.id || "").trim().toLowerCase();

  switch (raw) {
    case "towel":
    case "towels":
      return "🧺";
    case "toilet-paper":
    case "toilet_paper":
      return "🧻";
    case "pillow":
    case "extra_pillow":
      return "🛏️";
    case "blanket":
    case "extra_blanket":
      return "🧣";
    case "bath":
    case "bathrobe":
      return "🧥";
    case "shoe":
    case "slippers":
      return "🥿";
    case "baby":
    case "baby_cot":
      return "👶";
    case "iron":
      return "🧼";
    case "laundry":
      return "🧺";
    case "cleaning":
    case "room_cleaning_request":
    case "extra_cleaning":
    case "sparkles":
      return "🧹";
    case "minibar":
    case "minibar_refill":
      return "🥤";
    case "clock":
    case "late_checkout":
      return "🕒";
    case "alarm-clock":
    case "wake_up_call":
      return "⏰";
    case "taxi":
      return "🚕";
    case "info":
    case "information":
    case "information_request":
      return "ℹ️";
    case "reservation":
    case "reservation_help":
    case "restaurant":
    case "restaurant_reservation":
      return "🍽️";
    case "luggage":
    case "luggage_help":
      return "🧳";
    case "air":
    case "air_conditioning":
      return "❄️";
    case "hot-water":
    case "no_hot_water":
      return "🚿";
    case "tv":
    case "tv_issue":
      return "📺";
    case "light":
    case "light_issue":
      return "💡";
    case "bathroom":
    case "bathroom_issue":
      return "🚽";
    case "lock":
    case "door_lock_issue":
      return "🚪";
    case "wifi":
    case "wifi_issue":
      return "📶";
    case "power":
    case "power_outlet_issue":
      return "🔌";
    case "safe":
    case "safe_issue":
      return "🔒";
    case "door":
    case "balcony_door_issue":
      return "🚪";
    case "tools":
    case "other_technical_issue":
      return "🛠️";
    case "alert":
      return "🚨";
    default: {
      const fallback = getGuestRequestIcon(String(def.requestType || def.id));
      return fallback === "•" ? "" : fallback;
    }
  }
}

export default function GuestHub({ config }: { config: HotelConfig }) {
  const [lang, setLang] = useState<LangKey>(config.languageDefault ?? "bg");

  const [aiQ, setAiQ] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const AI_RESET_AFTER_MS = 5 * 60 * 1000;

  const appHiddenAtRef = useRef<number | null>(null);

  const clearAiState = useCallback(() => {
    setAiQ("");
    setAiAnswer("");
    setAiLoading(false);
  }, [setAiQ, setAiAnswer, setAiLoading]);

  const sp = useSearchParams();
  const qrRoom = (sp.get("room") || "").trim();

  const [manualRoomInput, setManualRoomInput] = useState(qrRoom);
  const [room, setRoom] = useState(qrRoom);
  const [roomConfirmed, setRoomConfirmed] = useState(Boolean(qrRoom));
  const [guestRequestRefs, setGuestRequestRefs] = useState<StoredGuestRequestRef[]>([]);
  const [guestRequests, setGuestRequests] = useState<GuestStatusItem[]>([]);
  const [guestRequestsLoading, setGuestRequestsLoading] = useState(false);
  const [showRequestSuccess, setShowRequestSuccess] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [submittingRequestLabel, setSubmittingRequestLabel] = useState("");
  const [hotelId, setHotelId] = useState("");
  const [hotelScopeReady, setHotelScopeReady] = useState(false);
  const submittingRequestRef = useRef(false);
  const recentSubmissionRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!showRequestSuccess) return;

    const timeout = window.setTimeout(() => {
      setShowRequestSuccess(false);
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [showRequestSuccess]);


  useEffect(() => {
    let cancelled = false;

    const resolveHotelScope = async () => {
      setHotelScopeReady(false);

      try {
        const resolvedHotelId = await getHotelIdBySlug(config.hotelSlug);
        if (!cancelled) {
          setHotelId(resolvedHotelId);
        }
      } catch (error) {
        console.error("Failed to resolve hotel scope for guest hub", {
          hotelSlug: config.hotelSlug,
          error,
        });
        if (!cancelled) {
          setHotelId("");
        }
      } finally {
        if (!cancelled) {
          setHotelScopeReady(true);
        }
      }
    };

    void resolveHotelScope();

    return () => {
      cancelled = true;
    };
  }, [config.hotelSlug]);


  const fallbackLangs = useMemo(() => {
    const preferred = [
      String(lang || "").trim(),
      String(config.languageDefault || "").trim(),
      "bg",
      "en",
      "de",
    ].filter(Boolean) as LangKey[];

    return Array.from(new Set(preferred));
  }, [config.languageDefault, lang]);

  const translateFromI18n = useCallback(
    (targetLang: LangKey, key: string) => {
      const current = config.i18n?.[String(targetLang)]?.[key];
      if (current && String(current).trim() && String(current).trim() !== key) {
        return String(current).trim();
      }

      for (const fallback of fallbackLangs) {
        const value = config.i18n?.[String(fallback)]?.[key];
        if (value && String(value).trim() && String(value).trim() !== key) {
          return String(value).trim();
        }
      }

      return "";
    },
    [config.i18n, fallbackLangs]
  );

  const tUI = useCallback((key: string) => translateFromI18n(lang, key), [lang, translateFromI18n]);

  const opsLang = (config.opsLanguage ?? "bg") as LangKey;
  const tOPS = useCallback((key: string) => translateFromI18n(opsLang, key), [opsLang, translateFromI18n]);

  const helperEnabled = Boolean(config.staffHelperEnabled);
  const helperLang = (config.staffHelperLanguage ?? "en") as LangKey;
  const tHELP = useCallback((key: string) => translateFromI18n(helperLang, key), [helperLang, translateFromI18n]);

  const roomCopy = useMemo(() => {
    const copy = {
      bg: {
        roomBadge: "Стая {room}",
        cardTitle: "Потвърдете номера на стаята",
        cardText:
          "За да се отключат функциите на отделите, въведете и потвърдете номера на стаята си.",
        inputLabel: "Номер на стая",
        inputPlaceholder: "Напр. 204",
        confirmButton: "Потвърди стаята",
        confirmMessage: "Сигурни ли сте, че това е вашата стая?\nСтая {room}",
        confirmedState: "Потвърдена стая: {room}",
        changeRoom: "Смени стаята",
        lockedNotice: "Секциите ще се отворят, когато въведете номера на стаята.",
        lockedSectionMessage:
          "Потвърдете номера на стаята, за да отключите тази секция.",
        missingRoomAlert: "Моля, въведете номер на стая.",
        missingRoomQrAlert:
          "Липсва номер на стая. Моля, сканирайте QR кода на стаята отново или въведете стаята ръчно.",
        requestSent: "Заявката е изпратена: {typeLabel}",
        requestAcceptedTitle: "Заявката е приета",
        requestAcceptedText:
          "Вашата заявка е приета и ще бъде обработена възможно най-скоро.",
        requestSendingTitle: "Изпращане на заявка",
        requestSendingText: "Моля, изчакайте. Изпращаме: {typeLabel}",
        requestFailed: "Неуспешно изпращане на заявката. Опитайте отново.",
        myRequestsTitle: "Моите заявки",
        myRequestsEmpty: "Все още няма изпратени заявки от това устройство.",
        myRequestsLoading: "Зареждане на статусите...",
        refreshRequests: "Обнови",
        status_new: "Приета",
        status_in_progress: "В обработка",
        status_completed: "Изпълнена",
        status_returned: "Върната",
        lockedActionAlert:
          "Първо потвърдете номера на стаята, за да отключите функциите.",
      },
      en: {
        roomBadge: "Room {room}",
        cardTitle: "Confirm your room number",
        cardText:
          "To unlock the department functions, enter and confirm your room number.",
        inputLabel: "Room number",
        inputPlaceholder: "Example: 204",
        confirmButton: "Confirm room",
        confirmMessage: "Are you sure this is your room?\nRoom {room}",
        confirmedState: "Confirmed room: {room}",
        changeRoom: "Change room",
        lockedNotice: "The sections will open when you enter your room number.",
        lockedSectionMessage:
          "Confirm your room number to unlock this section.",
        missingRoomAlert: "Please enter a room number.",
        missingRoomQrAlert:
          "Missing room number. Please rescan the room QR code or enter the room manually.",
        requestSent: "Request sent: {typeLabel}",
        requestAcceptedTitle: "Request received",
        requestAcceptedText:
          "Your request has been received and will be processed as soon as possible.",
        requestSendingTitle: "Sending request",
        requestSendingText: "Please wait. Sending: {typeLabel}",
        requestFailed: "Failed to send request. Please try again.",
        myRequestsTitle: "My requests",
        myRequestsEmpty: "No requests have been sent from this device yet.",
        myRequestsLoading: "Loading request statuses...",
        refreshRequests: "Refresh",
        status_new: "Received",
        status_in_progress: "In progress",
        status_completed: "Completed",
        status_returned: "Returned",
        lockedActionAlert:
          "Please confirm your room number first to unlock the functions.",
      },
      de: {
        roomBadge: "Zimmer {room}",
        cardTitle: "Bitte Zimmernummer bestätigen",
        cardText:
          "Um die Funktionen der Abteilungen freizuschalten, geben Sie Ihre Zimmernummer ein und bestätigen Sie sie.",
        inputLabel: "Zimmernummer",
        inputPlaceholder: "Zum Beispiel: 204",
        confirmButton: "Zimmer bestätigen",
        confirmMessage: "Sind Sie sicher, dass dies Ihr Zimmer ist?\nZimmer {room}",
        confirmedState: "Bestätigtes Zimmer: {room}",
        changeRoom: "Zimmer ändern",
        lockedNotice: "Die Bereiche werden geöffnet, wenn Sie Ihre Zimmernummer eingeben.",
        lockedSectionMessage:
          "Bestätigen Sie Ihre Zimmernummer, um diesen Bereich freizuschalten.",
        missingRoomAlert: "Bitte geben Sie eine Zimmernummer ein.",
        missingRoomQrAlert:
          "Zimmernummer fehlt. Bitte scannen Sie den QR-Code des Zimmers erneut oder geben Sie die Zimmernummer manuell ein.",
        requestSent: "Anfrage gesendet: {typeLabel}",
        requestAcceptedTitle: "Anfrage erhalten",
        requestAcceptedText:
          "Ihre Anfrage wurde erhalten und wird so schnell wie möglich bearbeitet.",
        requestSendingTitle: "Anfrage wird gesendet",
        requestSendingText: "Bitte warten. Es wird gesendet: {typeLabel}",
        requestFailed: "Anfrage konnte nicht gesendet werden. Bitte erneut versuchen.",
        myRequestsTitle: "Meine Anfragen",
        myRequestsEmpty: "Von diesem Gerät wurden noch keine Anfragen gesendet.",
        myRequestsLoading: "Status wird geladen...",
        refreshRequests: "Aktualisieren",
        status_new: "Erhalten",
        status_in_progress: "In Bearbeitung",
        status_completed: "Erledigt",
        status_returned: "Zurückgegeben",
        lockedActionAlert:
          "Bitte bestätigen Sie zuerst Ihre Zimmernummer, um die Funktionen freizuschalten.",
      },
    } as const;

    if (lang === "bg" || lang === "en" || lang === "de") {
      return copy[lang];
    }

    return copy.en;
  }, [lang]);

  const roomPrefix = room ? `${roomCopy.roomBadge.replace("{room}", room)} - ` : "";

  const aiIntroText = useMemo(() => {
    const map = {
      bg:
        "Мога да помагам само с информация за хотела – ресторанти, барове, работно време, спа, детски кът, удобства и услуги в хотела.",
      en:
        "I can help only with hotel information – restaurants, bars, opening hours, spa, kids club, facilities and hotel services.",
      de:
        "Ich kann nur mit Hotelinformationen helfen – Restaurants, Bars, Öffnungszeiten, Spa, Kinderclub, Einrichtungen und Hoteldienstleistungen.",
    } as const;

    const translated = String(tUI("ai_intro") || "").trim();

    if (translated && translated !== "ai_intro") {
      return translated;
    }

    return map[(lang as "bg" | "en" | "de")] || map.bg;
  }, [lang, tUI]);

  const guestStatusLabel = useCallback(
    (status: StaffRequestStatus) => {
      const key = `status_${status}` as const;
      return String((roomCopy as Record<string, string>)[key] || status);
    },
    [roomCopy]
  );

  const activeGuestRequests = useMemo(
    () => guestRequests.filter((item) => item.status !== "completed"),
    [guestRequests]
  );

  const contact = config.contacts;
  const deptHours = config.departmentHours ?? {};

  const roomRequiredSectionIds = new Set([
    "reception",
    "housekeeping",
    "maintenance",
    "outlets",
    "activities",
    "ai",
  ]);

  const loadGuestRequests = useCallback(
    async (refsOverride?: StoredGuestRequestRef[]) => {
      const refs = refsOverride ?? guestRequestRefs;
      const ids = [...new Set(refs.map((item) => item.id).filter(Boolean))];

      if (!ids.length || !roomConfirmed || !room.trim() || !hotelScopeReady || !hotelId) {
        setGuestRequests([]);
        return;
      }

      try {
        setGuestRequestsLoading(true);

        const { data, error } = await supabase
          .from("guest_requests")
          .select("id, room_number_snapshot, title, request_type, status, created_at")
          .eq("hotel_id", hotelId)
          .in("id", ids)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("loadGuestRequests failed", { error, ids });
          return;
        }

        const rows = ((data as GuestStatusRow[] | null) ?? []).filter(
          (row) => (row.room_number_snapshot ?? "") === room
        );

        const completedIds = new Set(
          rows.filter((row) => row.status === "completed").map((row) => row.id)
        );

        const activeItems = rows
          .filter((row) => row.status !== "completed")
          .map(mapGuestStatusRow);

        setGuestRequests(activeItems);

        if (completedIds.size) {
          const nextRefs = readStoredGuestRequestRefs().filter(
            (item) => !(item.room === room && completedIds.has(item.id))
          );

          writeStoredGuestRequestRefs(nextRefs);
          setGuestRequestRefs(nextRefs);
        }
      } finally {
        setGuestRequestsLoading(false);
      }
    },
    [guestRequestRefs, hotelId, hotelScopeReady, room, roomConfirmed]
  );

  useEffect(() => {
    const roomRefs = guestRequestRefs.filter((item) => item.room === room);

    if (!roomConfirmed || !room.trim() || !roomRefs.length || !hotelScopeReady || !hotelId) {
      setGuestRequests([]);
      return;
    }

    let cancelled = false;

    const safeLoad = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      try {
        await loadGuestRequests(roomRefs);
      } catch (error) {
        console.error("guest request refresh failed", error);
      }
    };

    void safeLoad();

    const interval = window.setInterval(() => {
      void safeLoad();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [guestRequestRefs, hotelId, hotelScopeReady, loadGuestRequests, room, roomConfirmed]);

  const ensureConfirmedRoom = () => {
    if (roomConfirmed && room.trim()) return true;
    window.alert(roomCopy.lockedActionAlert);
    return false;
  };

  const confirmManualRoom = () => {
    const candidate = manualRoomInput.trim();

    if (!candidate) {
      window.alert(roomCopy.missingRoomAlert);
      return;
    }

    const confirmed = window.confirm(
      roomCopy.confirmMessage.replace("{room}", candidate)
    );

    if (!confirmed) {
      setRoomConfirmed(false);
      setRoom("");
      return;
    }

    setRoom(candidate);
    setRoomConfirmed(true);
  };

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
    (config.housekeepingExtras as Array<{
      key: string;
      labelKey: string;
      messageKey: string;
    }> | undefined) ??
    [
      { key: "laundry", labelKey: "laundry", messageKey: "msg_laundry" },
      { key: "iron", labelKey: "iron", messageKey: "msg_iron" },
      { key: "minibar", labelKey: "minibar", messageKey: "msg_minibar" },
      { key: "blanket", labelKey: "blanket", messageKey: "msg_blanket" },
    ];

  const housekeepingExtraActions: Record<
    string,
    | { mode: "info"; getMessage: (lang: LangKey) => string }
    | { mode: "request"; type: StaffRequestType; typeLabel: string; note?: string }
  > = {
    laundry: {
      mode: "info",
      getMessage: (lang: LangKey) =>
      ({
        bg: "За услугата пране, моля, обърнете се към рецепция.",
        en: "For laundry service, please contact reception.",
        de: "Für den Wäscheservice wenden Sie sich bitte an die Rezeption.",
      }[lang] || "For laundry service, please contact reception."),
    },
    iron: {
      mode: "request",
      type: "iron",
      typeLabel: "Iron",
    },
    minibar: {
      mode: "request",
      type: "minibar",
      typeLabel: "Minibar refill",
    },
    blanket: {
      mode: "request",
      type: "extra_blanket",
      typeLabel: "Extra blanket",
    },
  };
  const hiddenGuestRequestIds = new Set([
    "room_cleaning_request",
    "extra_cleaning",
    "cleaning",
  ]);

  const requestDefs = useMemo(
    () =>
    (((config.requestDefs ?? []) as RequestDef[])
      .filter(
        (def) =>
          def &&
          def.id &&
          def.enabled !== false &&
          !hiddenGuestRequestIds.has(String(def.id).trim().toLowerCase())
      )
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))),
    [config.requestDefs]
  );

  const getRequestDefField = useCallback(
    (def: RequestDef, field: "title" | "subtitle" | "description" | "policy" | "success" | "staffLabel") =>
      getRequestDefText(def, lang, field, fallbackLangs),
    [fallbackLangs, lang]
  );

  const getRequestDefMessage = useCallback(
    (def?: RequestDef | null) => {
      if (!def) return "";
      return [
        getRequestDefField(def, "description"),
        getRequestDefField(def, "policy"),
        getRequestDefField(def, "subtitle"),
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join("\n\n");
    },
    [getRequestDefField]
  );

  const requestDefsByCategory = useMemo(() => {
    return requestDefs.reduce<Record<string, RequestDef[]>>((acc, def) => {
      const category = String(def.category || "general").trim().toLowerCase();
      if (!acc[category]) acc[category] = [];
      acc[category].push(def);
      return acc;
    }, {});
  }, [requestDefs]);

  const requestDefIds = useMemo(() => new Set(requestDefs.map((def) => def.id)), [requestDefs]);
  const hasReceptionDefs = (requestDefsByCategory["reception"] ?? []).length > 0;
  const hasHousekeepingDefs = (requestDefsByCategory["housekeeping"] ?? []).length > 0;
  const hasMaintenanceDefs = (requestDefsByCategory["maintenance"] ?? []).length > 0;

  const lateCheckoutDef = useMemo(
    () => requestDefs.find((def) => def.id === "late_checkout"),
    [requestDefs]
  );
  const minibarDef = useMemo(
    () => requestDefs.find((def) => def.id === "minibar_refill" || def.id === "minibar"),
    [requestDefs]
  );
  const minibarInfoDef = useMemo(
    () => requestDefs.find((def) => def.id === "minibar_notice" || (def.id === "minibar" && def.type !== "request")),
    [requestDefs]
  );
  const wakeUpDef = useMemo(
    () => requestDefs.find((def) => def.id === "wake_up_call"),
    [requestDefs]
  );

  const lateCheckoutInfo = String(
    getRequestDefMessage(lateCheckoutDef) ||
    (config as any).lateCheckoutInfo ||
    tUI("late_checkout_info") ||
    ""
  ).trim();

  const minibarNotice = String(
    getRequestDefMessage(minibarInfoDef || minibarDef) ||
    (config as any).minibarNotice ||
    tUI("minibar_notice") ||
    ""
  ).trim();

  const wakeUpSlots = useMemo(() => {
    const fromDef = (wakeUpDef?.options ?? []).map((item) => String(item).trim()).filter(Boolean);
    if (fromDef.length) return fromDef;

    return String(
      (config as any).wakeUpSlots || "05:00,05:30,06:00,06:30,07:00,07:30,08:00"
    )
      .split(/[|,]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }, [config, wakeUpDef]);

  const requestDefAiServices = useMemo(() => {
    const sectionLabels = {
      housekeeping: String(tUI("housekeeping_title") || "Housekeeping"),
      reception: String(tUI("reception_title") || "Reception"),
      maintenance: String(tUI("maintenance_title") || "Maintenance"),
    };

    const routeLabelByLang = {
      bg: (section: string) => `Изпратете заявката от секцията ${section} в хъба.`,
      en: (section: string) => `Send the request from the ${section} section in the hub.`,
      de: (section: string) => `Senden Sie die Anfrage über den Bereich ${section} im Hub.`,
    } as const;

    const slotLabelByLang = {
      bg: (slots: string) => `Налични часове: ${slots}.`,
      en: (slots: string) => `Available times: ${slots}.`,
      de: (slots: string) => `Verfügbare Zeiten: ${slots}.`,
    } as const;

    const currentLang = (lang === "bg" || lang === "en" || lang === "de") ? lang : "en";

    return requestDefs
      .filter((def) => def.aiVisible !== false && def.guestVisible !== false)
      .map((def) => {
        const label = getRequestDefField(def, "title") || def.id.replace(/_/g, " ");
        const baseMessage = getRequestDefMessage(def);
        const dept = String(def.targetDepartment || def.category || "").trim().toLowerCase();
        const section = (
          dept === "housekeeping"
            ? sectionLabels.housekeeping
            : dept === "reception"
              ? sectionLabels.reception
              : dept === "maintenance"
                ? sectionLabels.maintenance
                : ""
        );

        const extras: string[] = [];

        if (def.type === "request" && section) {
          extras.push(routeLabelByLang[currentLang](section));
        }

        if ((def.requestKind === "time_slot" || (def.requiresTime && def.timeMode === "slots")) && def.options.length) {
          extras.push(slotLabelByLang[currentLang](def.options.join(", ")));
        }

        return {
          key: def.id,
          label,
          description: [baseMessage, ...extras].map((item) => String(item || "").trim()).filter(Boolean).join("\n\n"),
          active: def.enabled !== false,
          category: def.category,
          keywords: [
            def.id,
            def.id.replace(/_/g, " "),
            ...def.keywords,
            ...def.options,
          ].filter(Boolean),
        };
      });
  }, [getRequestDefField, getRequestDefMessage, lang, requestDefs, tUI]);

  const aiServices = useMemo(() => {
    const sectionLabels = {
      housekeeping: String(tUI("housekeeping_title") || "Housekeeping"),
      reception: String(tUI("reception_title") || "Reception"),
      maintenance: String(tUI("maintenance_title") || "Maintenance"),
    };

    const copy = {
      bg: {
        requestFrom: (label: string, section: string) =>
          `Да, можете да заявите ${label.toLowerCase()} от секцията ${section} в хъба.`,
        laundry:
          "За услугата пране, моля, обърнете се към рецепция.",
        lateCheckout:
          lateCheckoutInfo ||
          "Late check-out зависи от наличност и се заявява през рецепция.",
        wakeUp: `Можете да заявите събуждане от секцията ${sectionLabels.reception}. Налични часове: ${wakeUpSlots.join(", ")}.`,
        minibar: minibarNotice
          ? `${minibarNotice} Можете да заявите зареждане от секцията ${sectionLabels.housekeeping}.`
          : `Можете да заявите зареждане на минибара от секцията ${sectionLabels.housekeeping}.`,
        taxi: `Можете да заявите такси от секцията ${sectionLabels.reception}.`,
        ac: `Можете да подадете сигнал за проблем с климатика от секцията ${sectionLabels.maintenance}.`,
        hotWater: `Можете да подадете сигнал за липса на топла вода от секцията ${sectionLabels.maintenance}.`,
        broken: `Можете да подадете сигнал за технически проблем от секцията ${sectionLabels.maintenance}.`,
      },
      en: {
        requestFrom: (label: string, section: string) =>
          `Yes, you can request ${label.toLowerCase()} from the ${section} section in the hub.`,
        laundry:
          "For laundry service, please contact reception.",
        lateCheckout:
          lateCheckoutInfo ||
          "Late check-out is subject to availability and should be requested through reception.",
        wakeUp: `You can request a wake-up call from the ${sectionLabels.reception} section. Available times: ${wakeUpSlots.join(", ")}.`,
        minibar: minibarNotice
          ? `${minibarNotice} You can request minibar refill from the ${sectionLabels.housekeeping} section.`
          : `You can request minibar refill from the ${sectionLabels.housekeeping} section.`,
        taxi: `You can request a taxi from the ${sectionLabels.reception} section.`,
        ac: `You can report an air-conditioning issue from the ${sectionLabels.maintenance} section.`,
        hotWater: `You can report a hot water issue from the ${sectionLabels.maintenance} section.`,
        broken: `You can report a technical issue from the ${sectionLabels.maintenance} section.`,
      },
      de: {
        requestFrom: (label: string, section: string) =>
          `Ja, Sie können ${label.toLowerCase()} über den Bereich ${section} im Hub anfragen.`,
        laundry:
          "Für den Wäscheservice wenden Sie sich bitte an die Rezeption.",
        lateCheckout:
          lateCheckoutInfo ||
          "Late Check-out ist abhängig von der Verfügbarkeit und wird über die Rezeption angefragt.",
        wakeUp: `Sie können einen Weckruf über den Bereich ${sectionLabels.reception} anfragen. Verfügbare Zeiten: ${wakeUpSlots.join(", ")}.`,
        minibar: minibarNotice
          ? `${minibarNotice} Sie können eine Minibar-Auffüllung über den Bereich ${sectionLabels.housekeeping} anfragen.`
          : `Sie können eine Minibar-Auffüllung über den Bereich ${sectionLabels.housekeeping} anfragen.`,
        taxi: `Sie können ein Taxi über den Bereich ${sectionLabels.reception} anfragen.`,
        ac: `Sie können ein Problem mit der Klimaanlage über den Bereich ${sectionLabels.maintenance} melden.`,
        hotWater: `Sie können fehlendes Warmwasser über den Bereich ${sectionLabels.maintenance} melden.`,
        broken: `Sie können ein technisches Problem über den Bereich ${sectionLabels.maintenance} melden.`,
      },
    } as const;

    const c = copy[(lang === "bg" || lang === "en" || lang === "de") ? lang : "en"];

    const legacyServices = [
      {
        key: "towels",
        label: String(tUI("towels") || "Towels"),
        description: c.requestFrom(String(tUI("towels") || "Towels"), sectionLabels.housekeeping),
        active: true,
      },
      {
        key: "toilet_paper",
        label: String(tUI("toilet_paper") || "Toilet paper"),
        description: c.requestFrom(String(tUI("toilet_paper") || "Toilet paper"), sectionLabels.housekeeping),
        active: true,
      },
      {
        key: "extra_pillow",
        label: String(tUI("extra_pillows") || "Extra pillow"),
        description: c.requestFrom(String(tUI("extra_pillows") || "Extra pillow"), sectionLabels.housekeeping),
        active: true,
      },
      {
        key: "extra_blanket",
        label: String(tUI("blanket") || "Extra blanket"),
        description: c.requestFrom(String(tUI("blanket") || "Extra blanket"), sectionLabels.housekeeping),
        active: true,
      },
      {
        key: "iron",
        label: String(tUI("iron") || "Iron"),
        description: c.requestFrom(String(tUI("iron") || "Iron"), sectionLabels.housekeeping),
        active: true,
      },
      {
        key: "minibar",
        label: String(tUI("minibar") || "Minibar"),
        description: c.minibar,
        active: true,
      },
      {
        key: "laundry",
        label: String(tUI("laundry") || "Laundry"),
        description: c.laundry,
        active: true,
      },
      {
        key: "late_checkout",
        label: String(tUI("late_checkout") || "Late checkout"),
        description: c.lateCheckout,
        active: true,
      },
      {
        key: "wake_up_call",
        label: String(tUI("wake_up") || "Wake-up call"),
        description: c.wakeUp,
        active: true,
      },
      {
        key: "taxi",
        label: String(tUI("taxi") || "Taxi"),
        description: c.taxi,
        active: true,
      },
      {
        key: "air_conditioning",
        label: String(tUI("ac_issue") || "Air conditioning issue"),
        description: c.ac,
        active: true,
      },
      {
        key: "no_hot_water",
        label: String(tUI("water_issue") || "No hot water"),
        description: c.hotWater,
        active: true,
      },
      {
        key: "other_technical_issue",
        label: String(tUI("something_broken") || "Technical issue"),
        description: c.broken,
        active: true,
      },
    ];

    const existingKeys = new Set(requestDefAiServices.map((service) => service.key));
    return [
      ...requestDefAiServices,
      ...legacyServices.filter((service) => !existingKeys.has(service.key)),
    ];
  }, [lang, lateCheckoutInfo, minibarNotice, requestDefAiServices, tUI, wakeUpSlots]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        appHiddenAtRef.current = Date.now();
        return;
      }

      const hiddenAt = appHiddenAtRef.current;
      if (!hiddenAt) return;

      const elapsed = Date.now() - hiddenAt;
      if (elapsed >= AI_RESET_AFTER_MS) {
        clearAiState();
      }

      appHiddenAtRef.current = null;
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearAiState]);

  function confirmInfoBlock(message: string) {
    if (!message) return true;
    return window.confirm(
      `${message}\n\n${String(
        tUI("continue_request") || "Продължи със заявката?"
      )}`
    );
  }

  function chooseWakeUpSlot(options = wakeUpSlots) {
    if (!options.length) return null;

    const list = options
      .map((slot, index) => `${index + 1}. ${slot}`)
      .join("\n");

    const picked = (window.prompt(
      `${String(
        tUI("wake_up_select") || "Изберете час за събуждане:"
      )}\n\n${list}`,
      options[0]
    ) || "").trim();

    if (!picked) return null;

    if (options.includes(picked)) return picked;

    const numericIndex = Number(picked);
    if (
      Number.isInteger(numericIndex) &&
      numericIndex >= 1 &&
      numericIndex <= options.length
    ) {
      return options[numericIndex - 1];
    }

    window.alert(
      String(tUI("wake_up_invalid") || "Невалиден час за събуждане.")
    );
    return null;
  }

  function promptRequestNote(def: RequestDef) {
    const promptLabel =
      getRequestDefField(def, "subtitle") ||
      tUI("request_note_prompt") ||
      "Add details (optional):";

    return (window.prompt(String(promptLabel), "") || "").trim();
  }

  function promptRequestQuantity(def: RequestDef) {
    const min = def.minQty ?? 1;
    const max = def.maxQty ?? 10;
    const raw = (window.prompt(
      String(tUI("request_quantity_prompt") || `Quantity (${min}-${max}):`),
      String(min)
    ) || "").trim();

    if (!raw) return null;

    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty < min || qty > max) {
      window.alert(String(tUI("request_quantity_invalid") || `Please enter a number between ${min} and ${max}.`));
      return null;
    }

    return qty;
  }

  function buildRequestDefNote(def: RequestDef, infoMessage: string) {
    const noteParts: string[] = [];
    const shouldAskLateCheckoutTime = def.id === "late_checkout" && !def.requiresTime;

    if ((def.requestKind === "time_slot" || (def.requiresTime && def.timeMode === "slots")) && def.options.length) {
      const slot = chooseWakeUpSlot(def.options);
      if (!slot) return null;
      noteParts.push(`${String(tUI("wake_up_selected") || "Selected time")}: ${slot}`);
    } else if ((def.requiresTime && def.timeMode === "free") || shouldAskLateCheckoutTime) {
      const timeLabel = def.id === "late_checkout"
        ? (
          tUI("late_checkout_time_prompt") ||
          (lang === "bg"
            ? "Желан час за късен чек-аут:"
            : lang === "de"
              ? "Gewünschte Uhrzeit für den späten Check-out:"
              : "Desired late checkout time:")
        )
        : String(tUI("prompt_time") || "Time:");

      const timeExample = def.id === "late_checkout"
        ? (lang === "bg" ? "13:00" : lang === "de" ? "13:00" : "13:00")
        : String(tUI("example_time") || "07:00");

      const pickedTime = askRequired(
        String(timeLabel),
        String(timeExample),
        reTime,
        String(tUI("invalid_time") || "Invalid time")
      );

      if (!pickedTime) return null;

      const selectedLabel = def.id === "late_checkout"
        ? (
          tUI("late_checkout_selected_time") ||
          (lang === "bg"
            ? "Желан час за напускане"
            : lang === "de"
              ? "Gewünschte Check-out-Zeit"
              : "Desired checkout time")
        )
        : String(tUI("label_time") || "Time");

      noteParts.push(`${String(selectedLabel)}: ${pickedTime}`);
    }

    if (def.requiresQuantity) {
      const qty = promptRequestQuantity(def);
      if (qty == null) return null;
      noteParts.push(`${String(tUI("label_people") || "Quantity")}: ${qty}`);
    }

    if (def.requiresNote) {
      const note = promptRequestNote(def);
      if (note) noteParts.push(note);
    }

    const composed = noteParts.map((item) => item.trim()).filter(Boolean).join("\n").trim();
    if (composed) return composed;

    if (def.id === "late_checkout" || def.id === "minibar") {
      return infoMessage || undefined;
    }

    return undefined;
  }

  function handleRequestDefClick(def: RequestDef) {
    if (!ensureConfirmedRoom()) return;

    const infoMessage = getRequestDefMessage(def);

    if (def.type !== "request" || def.requestKind === "info_only") {
      window.alert(infoMessage || getRequestDefField(def, "title") || def.id);
      return;
    }

    if (infoMessage && def.confirmationMode !== "instant") {
      if (!confirmInfoBlock(infoMessage)) return;
    }

    const note = buildRequestDefNote(def, infoMessage);
    if (note === null) return;

    submitGuestRequest({
      type: String(def.requestType || def.id) as StaffRequestType,
      typeLabel: getRequestDefField(def, "title") || def.id.replace(/_/g, " "),
      note: note || undefined,
    });
  }

  function buildRequestDefItems(category: string): HubItem[] {
    const defs = requestDefsByCategory[String(category || "").trim().toLowerCase()] ?? [];

    return defs
      .filter((def) => def.guestVisible !== false)
      .map((def) => {
        const title = getRequestDefField(def, "title") || def.id.replace(/_/g, " ");
        const icon = getRequestDefButtonIcon(def);

        return {
          label: icon ? `${icon} ${title}` : title,
          kind: "link" as const,
          onClick: () => handleRequestDefClick(def),
        };
      });
  }
  const taxiProviders = config.taxiProviders ?? [];

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


  const sendHousekeeping = (msgKey: string) => {
    if (!ensureConfirmedRoom()) return;
    const routed = warnAndRouteIfClosed("housekeeping");
    const to =
      routed.dept === "reception"
        ? getDeptWhatsapp("reception")
        : getDeptWhatsapp("housekeeping");
    openWhatsApp(to, buildStaffMessage(msgKey), routed.warned);
  };

  const sendEvents = (msgKey: string) => {
    if (!ensureConfirmedRoom()) return;
    const routed = warnAndRouteIfClosed("events");
    const to =
      routed.dept === "reception"
        ? getDeptWhatsapp("reception")
        : getDeptWhatsapp("events");
    openWhatsApp(to, buildStaffMessage(msgKey), routed.warned);
  };

  const submitGuestRequest = async ({
    type,
    typeLabel,
    note,
    serviceTime = "now",
  }: {
    type: StaffRequestType;
    typeLabel: string;
    note?: string;
    serviceTime?: StaffServiceTime;
  }) => {
    const roomValue = room.trim();
    const signature = `${roomValue}::${type}`;
    const now = Date.now();
    const lastAt = recentSubmissionRef.current[signature] ?? 0;

    if (submittingRequestRef.current) return;

    if (!roomValue) {
      window.alert(roomCopy.missingRoomQrAlert);
      return;
    }

    if (!ensureConfirmedRoom()) return;

    if (!hotelScopeReady || !hotelId) {
      window.alert(roomCopy.requestFailed);
      return;
    }

    const hasSameActiveRequest = guestRequests.some(
      (item) =>
        item.room === roomValue &&
        item.type === type &&
        item.status !== "completed"
    );

    if (hasSameActiveRequest) {
      setShowRequestSuccess(true);
      return;
    }

    // Stop ultra-fast duplicate taps for the same room + request type
    if (now - lastAt < 5000) return;

    try {
      submittingRequestRef.current = true;
      recentSubmissionRef.current[signature] = now;
      const safeTypeLabel = cleanRequestTitle(typeLabel);
      setSubmittingRequest(true);
      setSubmittingRequestLabel(safeTypeLabel);

      const created = await createSupabaseRequest({
        hotelId,
        hotelSlug: config.hotelSlug,
        room: roomValue,
        type,
        typeLabel: safeTypeLabel,
        serviceTime,
        note,
      });

      const nextRefs = pushStoredGuestRequestRef({
        id: created.id,
        room: created.room,
      });

      setGuestRequestRefs(nextRefs);
      setGuestRequests((prev) => [
        {
          id: created.id,
          room: created.room,
          title: cleanRequestTitle(created.typeLabel),
          type,
          status: created.status,
          createdAt: created.createdAt,
        },
        ...prev.filter((item) => item.id !== created.id),
      ]);

      setShowRequestSuccess(true);
    } catch (error) {
      console.error("submitGuestRequest failed", error);
      delete recentSubmissionRef.current[signature];
      window.alert(roomCopy.requestFailed);
    } finally {
      submittingRequestRef.current = false;
      setSubmittingRequest(false);
      setSubmittingRequestLabel("");
    }
  };

  const askAI = async () => {
    if (!aiQ.trim()) return;
    if (!ensureConfirmedRoom()) return;

    try {
      setAiLoading(true);
      setAiAnswer("");

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
            venueRows: (config as any).venueRows ?? [],
            services: aiServices,
          },
        }),
      });

      const data = await res.json();

      if (!data?.ok) {
        setAiAnswer(String(tUI("ai_error") || "Възникна грешка при обработката."));
        return;
      }

      setAiAnswer(String(data.answer || tUI("ai_no_info") || "Все още нямам тази информация за хотела."));
    } catch {
      setAiAnswer(String(tUI("ai_error") || "Възникна грешка при обработката."));
    } finally {
      setAiLoading(false);
    }
  };

  const sendVenueReservation = (venue: VenueRow) => {
    if (!ensureConfirmedRoom()) return;

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
            `${String(tUI("reservation_outside_hours") || "Работното време е: {hours}").replace(
              "{hours}",
              hoursLabel
            )}`
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

    const routed = warnAndRouteIfClosed("restaurant");
    const to =
      routed.dept === "reception"
        ? getDeptWhatsapp("reception")
        : getDeptWhatsapp("restaurant");

    openWhatsApp(to, msg, routed.warned);
  };

  const openVenueReservation = (venue: VenueRow) => {
    if (!ensureConfirmedRoom()) return;

    const type = String(venue.reservationType || "").trim().toLowerCase();

    if (type === "none") return;

    const usesReservationForm = type === "whatsapp" || type === "email" || type === "phone";

    if (usesReservationForm) {
      sendVenueReservation(venue);
      return;
    }

    if (type === "url" && venue.reservationUrl) {
      window.open(String(venue.reservationUrl), "_blank", "noopener,noreferrer");
      return;
    }

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
      title: tUI("reception_title") || "Reception",
      items: [
        ...buildRequestDefItems("reception"),
        ...(!hasReceptionDefs && !requestDefIds.has("late_checkout")
          ? [
            {
              label: tUI("late_checkout") || "Late checkout",
              kind: "link" as const,
              onClick: () => {
                if (!ensureConfirmedRoom()) return;
                if (!confirmInfoBlock(lateCheckoutInfo)) return;

                submitGuestRequest({
                  type: "late_checkout",
                  typeLabel: String(tUI("late_checkout") || "Late checkout"),
                  note: lateCheckoutInfo || undefined,
                });
              },
            },
          ]
          : []),
        ...(!hasReceptionDefs && !requestDefIds.has("taxi")
          ? [
            {
              label: tUI("taxi") || "Taxi",
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "taxi",
                  typeLabel: "Taxi",
                }),
            },
          ]
          : []),
        ...(!hasReceptionDefs && !requestDefIds.has("wake_up_call")
          ? [
            {
              label: tUI("wake_up") || "Wake-up call",
              kind: "link" as const,
              onClick: () => {
                if (!ensureConfirmedRoom()) return;

                const slot = chooseWakeUpSlot();
                if (!slot) return;

                submitGuestRequest({
                  type: "wake_up_call",
                  typeLabel: String(tUI("wake_up") || "Wake-up call"),
                  note: `${String(tUI("wake_up_selected") || "Selected time")}: ${slot}`,
                });
              },
            },
          ]
          : []),
      ],
    },
    {
      id: "housekeeping",
      title: housekeepingRoutedToReception ? housekeepingTitleAfter : housekeepingTitle,
      subtitle: housekeepingRoutedToReception ? housekeepingAfterNote : undefined,
      items: [
        ...buildRequestDefItems("housekeeping"),
        ...(!hasHousekeepingDefs && !requestDefIds.has("towels")
          ? [
            {
              label: tUI("towels") || "Towels",
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "towels",
                  typeLabel: "Towels",
                }),
            },
          ]
          : []),
        ...(!hasHousekeepingDefs && !requestDefIds.has("toilet_paper")
          ? [
            {
              label: tUI("toilet_paper") || "Toilet paper",
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "toilet_paper",
                  typeLabel: "Toilet paper",
                }),
            },
          ]
          : []),
        ...(!hasHousekeepingDefs && !requestDefIds.has("extra_pillow")
          ? [
            {
              label: tUI("extra_pillows") || "Extra pillows",
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "extra_pillow",
                  typeLabel: "Extra pillow",
                }),
            },
          ]
          : []),
        ...hkExtras
          .filter((x) => !hasHousekeepingDefs && !requestDefIds.has(x.key === "blanket" ? "extra_blanket" : x.key === "minibar" ? "minibar_refill" : x.key))
          .map((x) => {
            const action = housekeepingExtraActions[x.key];

            if (action?.mode === "info") {
              return {
                label: tUI(x.labelKey) || x.labelKey,
                kind: "link" as const,
                onClick: () => {
                  if (!ensureConfirmedRoom()) return;
                  window.alert(action.getMessage(lang));
                },
              };
            }

            if (action?.mode === "request") {
              return {
                label: tUI(x.labelKey) || action.typeLabel,
                kind: "link" as const,
                onClick: () => {
                  if (!ensureConfirmedRoom()) return;

                  if (x.key === "minibar" && minibarNotice) {
                    if (!confirmInfoBlock(minibarNotice)) return;
                  }

                  submitGuestRequest({
                    type: action.type,
                    typeLabel: String(tUI(x.labelKey) || action.typeLabel),
                    note:
                      x.key === "minibar"
                        ? minibarNotice || undefined
                        : action.note,
                  });
                },
              };
            }

            return {
              label: tUI(x.labelKey) || x.labelKey,
              kind: "link" as const,
              onClick: () => sendHousekeeping(x.messageKey),
            };
          }),
      ],
    },
    {
      id: "maintenance",
      title: tUI("maintenance_title") || "Maintenance",
      items: [
        ...buildRequestDefItems("maintenance"),
        ...(!hasMaintenanceDefs && !requestDefIds.has("air_conditioning")
          ? [
            {
              label: tUI("ac_issue") || "Air conditioning issue",
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "air_conditioning",
                  typeLabel: "Air conditioning issue",
                }),
            },
          ]
          : []),
        ...(!hasMaintenanceDefs && !requestDefIds.has("no_hot_water")
          ? [
            {
              label: tUI("water_issue") || "No hot water",
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "no_hot_water",
                  typeLabel: "No hot water",
                }),
            },
          ]
          : []),
        ...(!hasMaintenanceDefs && !requestDefIds.has("coffee_machine")
          ? [
            {
              label: tUI("coffee_machine") || "Coffee machine",
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "other_technical_issue",
                  typeLabel: "Coffee machine issue",
                  note: "Guest reported a coffee machine issue.",
                }),
            },
          ]
          : []),
        ...(!hasMaintenanceDefs && !requestDefIds.has("other_technical_issue")
          ? [
            {
              label: tUI("something_broken") || "Something broken",
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "other_technical_issue",
                  typeLabel: "Something broken",
                  note: "Guest reported that something is broken.",
                }),
            },
          ]
          : []),
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
          href: `https://www.google.com/maps/search/${encodeURIComponent(
            "attractions near " + config.location.query
          )}`,
          newTab: true,
        },
        {
          label: tUI("restaurants_nearby"),
          kind: "link",
          href: `https://www.google.com/maps/search/${encodeURIComponent(
            "restaurants near " + config.location.query
          )}`,
          newTab: true,
        },
        {
          label: tUI("pharmacy"),
          kind: "link",
          href: `https://www.google.com/maps/search/${encodeURIComponent(
            "pharmacy near " + config.location.query
          )}`,
          newTab: true,
        },
      ],
    },
    {
      id: "reviews",
      title: tUI("reviews_title"),
      items: [
        ...(config.reviews.google
          ? [
            {
              label: tUI("leave_google_review"),
              kind: "link" as const,
              href: config.reviews.google,
              newTab: true,
            },
          ]
          : []),
        ...(config.reviews.tripadvisor
          ? [
            {
              label: tUI("leave_tripadvisor_review"),
              kind: "link" as const,
              href: config.reviews.tripadvisor,
              newTab: true,
            },
          ]
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
                  {roomCopy.roomBadge.replace("{room}", room)}
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

      <div className="mt-3 px-4">
        <InstallAppButton label={String(tUI("install_app") || "Инсталирай приложението")} />
      </div>

      {!qrRoom && !roomConfirmed ? (
        <div className="mt-3 px-4">
          <div className="rounded-2xl bg-neutral-900/60 p-4 ring-1 ring-neutral-800">
            <h2 className="text-base font-semibold text-white">{roomCopy.cardTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-300">{roomCopy.cardText}</p>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                {roomCopy.inputLabel}
              </label>
              <input
                value={manualRoomInput}
                onChange={(e) => {
                  setManualRoomInput(e.target.value);
                  setRoomConfirmed(false);
                  setRoom("");
                }}
                placeholder={roomCopy.inputPlaceholder}
                className="w-full rounded-xl bg-neutral-950/70 px-4 py-3 text-sm text-white outline-none ring-1 ring-neutral-800 placeholder:text-neutral-500"
              />
            </div>

            <button
              type="button"
              onClick={confirmManualRoom}
              className="mt-3 w-full rounded-xl bg-[#9B86BD] px-4 py-3 text-sm font-semibold text-[#0D1B2A] transition hover:opacity-95 active:scale-[0.99]"
            >
              {roomCopy.confirmButton}
            </button>

            <div className="mt-3 rounded-xl bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300 ring-1 ring-neutral-800">
              {roomCopy.lockedNotice}
            </div>
          </div>
        </div>
      ) : null}

      {submittingRequest ? (
        <div className="mt-3 px-4">
          <div className="rounded-2xl border border-sky-400/25 bg-sky-400/10 px-4 py-4 text-sky-50">
            <div className="text-sm font-semibold">{roomCopy.requestSendingTitle}</div>
            <p className="mt-1 text-sm leading-6 text-sky-100/90">
              {roomCopy.requestSendingText.replace("{typeLabel}", submittingRequestLabel || "...")}
            </p>
          </div>
        </div>
      ) : showRequestSuccess ? (
        <div className="mt-3 px-4">
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-4 text-emerald-50">
            <div className="text-sm font-semibold">{roomCopy.requestAcceptedTitle}</div>
            <p className="mt-1 text-sm leading-6 text-emerald-100/90">
              {roomCopy.requestAcceptedText}
            </p>
          </div>
        </div>
      ) : null}

      {roomConfirmed && (guestRequestsLoading || activeGuestRequests.length > 0) ? (
        <div className="mt-3 px-4">
          <div className="rounded-2xl bg-neutral-900/50 p-4 ring-1 ring-neutral-800">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-white">{roomCopy.myRequestsTitle}</h2>
              <button
                type="button"
                onClick={() => void loadGuestRequests()}
                disabled={guestRequestsLoading}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-white ring-1 ring-neutral-700 transition hover:bg-neutral-800/70 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {roomCopy.refreshRequests}
              </button>
            </div>

            {guestRequestsLoading ? (
              <div className="mt-3 rounded-xl bg-neutral-950/60 px-3 py-3 text-sm text-neutral-300 ring-1 ring-neutral-800">
                {roomCopy.myRequestsLoading}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {activeGuestRequests.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl bg-neutral-950/60 px-3 py-3 ring-1 ring-neutral-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-white">
                          <span className="text-base leading-none">{getGuestRequestIcon(item.type)}</span>
                          <span>{item.title.replace(/^[^\p{L}\p{N}]+/u, "").trim()}</span>
                        </div>
                        <div className="mt-1 text-xs text-neutral-400">
                          {roomCopy.roomBadge.replace("{room}", item.room)} • {item.createdAt}
                        </div>
                      </div>

                      <StatusBadge label={guestStatusLabel(item.status)} status={item.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="p-4 pb-10">
        <div className="space-y-3">
          {sections.map((sec) => {
            const isLocked = !roomConfirmed && roomRequiredSectionIds.has(sec.id);

            if (isLocked) {
              return (
                <LockedSectionCard
                  key={sec.id}
                  title={String(sec.title)}
                  message={roomCopy.lockedSectionMessage}
                />
              );
            }

            return sec.id === "outlets" ? (
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
                aiIntroText={aiIntroText}
                submittingRequest={submittingRequest}
                onCloseAi={clearAiState}
              />
            );
          })}
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
  aiIntroText,
  submittingRequest,
  onCloseAi,
}: {
  section: HubSection;
  tUI: (k: string) => any;
  aiQ: string;
  setAiQ: (v: string) => void;
  aiA: string;
  aiLoading: boolean;
  askAI: () => void;
  aiIntroText: string;
  submittingRequest: boolean;
  onCloseAi?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const accentBg = "bg-[#9B86BD]";
  const accentText = "text-[#0D1B2A]";
  const accentRing = "ring-1 ring-[#9B86BD]/35";

  return (
    <div className="rounded-2xl overflow-hidden ring-1 ring-neutral-800 bg-neutral-900/40">
      <button
        type="button"
        onClick={() =>
          setOpen((prev) => {
            const next = !prev;

            if (section.id === "ai" && !next) {
              onCloseAi?.();
            }

            return next;
          })
        }
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
        <div className="bg-neutral-950/40 px-4 py-4">
          <div className="grid grid-cols-1 gap-2">
            {section.id === "ai" ? (
              <div className="grid grid-cols-1 gap-2">
                {!aiQ.trim() ? (
                  <div className="rounded-xl bg-neutral-900/60 p-3 text-sm leading-6 text-neutral-100 ring-1 ring-neutral-800">
                    {aiIntroText}
                  </div>
                ) : null}

                <textarea
                  value={aiQ}
                  onChange={(e) => setAiQ(e.target.value)}
                  placeholder={String(
                    tUI("ai_placeholder") || "Попитай нещо за хотела..."
                  )}
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
                      disabled={submittingRequest}
                      className={clsx(
                        "rounded-xl px-3 py-3 text-left text-sm font-semibold ring-1 transition",
                        submittingRequest
                          ? "cursor-not-allowed bg-neutral-800/60 text-neutral-400 ring-neutral-700 opacity-70"
                          : "bg-[#9B86BD]/14 ring-[#9B86BD]/25 text-white hover:bg-[#9B86BD]/20 active:scale-[0.99]"
                      )}
                    >
                      {submittingRequest ? String(tUI("request_sending_short") || "Изпращане...") : it.label}
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

function StatusBadge({
  label,
  status,
}: {
  label: string;
  status: StaffRequestStatus;
}) {
  const classes: Record<StaffRequestStatus, string> = {
    new: "border-amber-400/30 bg-amber-400/15 text-amber-200",
    in_progress: "border-sky-400/30 bg-sky-400/15 text-sky-200",
    completed: "border-emerald-400/30 bg-emerald-400/15 text-emerald-200",
    returned: "border-rose-400/30 bg-rose-400/15 text-rose-200",
  };

  return (
    <div
      className={clsx(
        "rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap",
        classes[status]
      )}
    >
      {label}
    </div>
  );
}

function LockedSectionCard({
  title,
}: {
  title: string;
  message?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/20 px-4 py-4 opacity-70">
      <div className="flex items-center justify-between gap-3">
        <div className="text-base font-semibold text-neutral-300">{title}</div>
        <div className="text-sm text-neutral-500">🔒</div>
      </div>
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
        <div className="bg-neutral-950/40 px-4 py-4">
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
                    <div className="space-y-2 p-3">
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
                              <div className="space-y-2 px-3 pb-3">
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

