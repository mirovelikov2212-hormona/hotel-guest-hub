"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { createSupabaseRequest } from "@/lib/staff/supabase-requests";
import type { StaffRequestType, StaffServiceTime, StaffRequestStatus } from "@/lib/staff/types";
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

function getGuestRequestIcon(type: StaffRequestType): string {
  switch (type) {
    case "towels":
      return "🧺";
    case "toilet_paper":
      return "🧻";
    case "extra_pillow":
      return "🛏️";
    case "extra_blanket":
      return "🧣";
    case "iron":
      return "🧼";
    case "minibar":
      return "🥤";
    case "late_checkout":
      return "🕒";
    case "taxi":
      return "🚕";
    case "wake_up_call":
      return "⏰";
    case "air_conditioning":
      return "❄️";
    case "no_hot_water":
      return "🚿";
    case "other_technical_issue":
      return "🛠️";
    default:
      return "•";
  }
}

export default function GuestHub({ config }: { config: HotelConfig }) {
  const [lang, setLang] = useState<LangKey>(config.languageDefault ?? "en");

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);

  const [aiQ, setAiQ] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

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
  const submittingRequestRef = useRef(false);
  const recentSubmissionRef = useRef<Record<string, number>>({});

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

  useEffect(() => {
    if (!qrRoom) return;
    setManualRoomInput(qrRoom);
    setRoom(qrRoom);
    setRoomConfirmed(true);
  }, [qrRoom]);

  useEffect(() => {
    setGuestRequestRefs(readStoredGuestRequestRefs());
  }, []);

  useEffect(() => {
    if (!showRequestSuccess) return;

    const timeout = window.setTimeout(() => {
      setShowRequestSuccess(false);
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [showRequestSuccess]);

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

      if (!ids.length || !roomConfirmed || !room.trim()) {
        setGuestRequests([]);
        return;
      }

      try {
        setGuestRequestsLoading(true);

        const { data, error } = await supabase
          .from("guest_requests")
          .select("id, room_number_snapshot, title, request_type, status, created_at")
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
    [guestRequestRefs, room, roomConfirmed]
  );

  useEffect(() => {
    const roomRefs = guestRequestRefs.filter((item) => item.room === room);

    if (!roomConfirmed || !room.trim() || !roomRefs.length) {
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
  }, [guestRequestRefs, loadGuestRequests, room, roomConfirmed]);

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

  const housekeepingExtraRequestMap: Partial<
    Record<
      string,
      { type: StaffRequestType; typeLabel: string; note?: string }
    >
  > = {
    blanket: {
      type: "extra_blanket",
      typeLabel: "Extra blanket",
    },
    bathrobe: {
      type: "bathrobe",
      typeLabel: "Bathrobe",
    },
    slippers: {
      type: "slippers",
      typeLabel: "Slippers",
    },
    baby_cot: {
      type: "baby_cot",
      typeLabel: "Baby cot",
    },
  };

  const taxiProviders = config.taxiProviders ?? [];
  const uberUrl =
    taxiProviders.find(
      (p: { name?: string; url?: string }) => (p.name || "").toLowerCase() === "uber"
    )?.url;

  void uberUrl;

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
      setSubmittingRequest(true);
      setSubmittingRequestLabel(typeLabel);

      const created = await createSupabaseRequest({
        room: roomValue,
        type,
        typeLabel,
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
          title: created.typeLabel,
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
    if (!ensureConfirmedRoom()) return "";

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
      title: tUI("reception_title"),
      items: [
        {
          label: tUI("late_checkout"),
          kind: "link",
          onClick: () =>
            submitGuestRequest({
              type: "late_checkout",
              typeLabel: "Late checkout",
            }),
        },
        {
          label: tUI("taxi"),
          kind: "link",
          onClick: () =>
            submitGuestRequest({
              type: "taxi",
              typeLabel: "Taxi",
            }),
        },
        {
          label: tUI("wake_up"),
          kind: "link",
          onClick: () =>
            submitGuestRequest({
              type: "wake_up_call",
              typeLabel: "Wake-up call",
            }),
        },
      ],
    },
    {
      id: "housekeeping",
      title: housekeepingRoutedToReception ? housekeepingTitleAfter : housekeepingTitle,
      subtitle: housekeepingRoutedToReception ? housekeepingAfterNote : undefined,
      items: [
        {
          label: tUI("towels"),
          kind: "link",
          onClick: () =>
            submitGuestRequest({
              type: "towels",
              typeLabel: "Towels",
            }),
        },
        {
          label: tUI("toilet_paper"),
          kind: "link",
          onClick: () =>
            submitGuestRequest({
              type: "toilet_paper",
              typeLabel: "Toilet paper",
            }),
        },
        {
          label: tUI("extra_pillows"),
          kind: "link",
          onClick: () =>
            submitGuestRequest({
              type: "extra_pillow",
              typeLabel: "Extra pillow",
            }),
        },
        ...hkExtras.map((x) => {
          const action = housekeepingExtraActions[x.key];

          if (action?.mode === "info") {
            return {
              label: tUI(x.labelKey),
              kind: "link" as const,
              onClick: () => {
                if (!ensureConfirmedRoom()) return;
                window.alert(action.getMessage(lang));
              },
            };
          }

          if (action?.mode === "request") {
            return {
              label: tUI(x.labelKey),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: action.type,
                  typeLabel: String(tUI(x.labelKey) || action.typeLabel),
                  note: action.note,
                }),
            };
          }

          return {
            label: tUI(x.labelKey),
            kind: "link" as const,
            onClick: () => sendHousekeeping(x.messageKey),
          };
        }),
      ],
    },
    {
      id: "maintenance",
      title: tUI("maintenance_title"),
      items: [
        {
          label: tUI("ac_issue"),
          kind: "link",
          onClick: () =>
            submitGuestRequest({
              type: "air_conditioning",
              typeLabel: "Air conditioning issue",
            }),
        },
        {
          label: tUI("water_issue"),
          kind: "link",
          onClick: () =>
            submitGuestRequest({
              type: "no_hot_water",
              typeLabel: "No hot water",
            }),
        },
        {
          label: tUI("coffee_machine"),
          kind: "link",
          onClick: () =>
            submitGuestRequest({
              type: "other_technical_issue",
              typeLabel: "Coffee machine issue",
              note: "Guest reported a coffee machine issue.",
            }),
        },
        {
          label: tUI("something_broken"),
          kind: "link",
          onClick: () =>
            submitGuestRequest({
              type: "other_technical_issue",
              typeLabel: "Something broken",
              note: "Guest reported that something is broken.",
            }),
        },
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
        <div className="bg-neutral-950/40 px-4 py-4">
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

