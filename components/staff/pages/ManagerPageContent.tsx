"use client";

import { useMemo, useState } from "react";
import StaffAlertSoundButton from "@/components/staff/StaffAlertSoundButton";
import StaffRequestCard from "@/components/staff/StaffRequestCard";
import StaffSummaryCard from "@/components/staff/StaffSummaryCard";
import ManagerPwaControls from "@/components/staff/ManagerPwaControls";
import { ManagerSurveyReportCard, ManagerTodaySurveysCard, useStaffSurveys } from "@/components/staff/StaffSurveyCards";
import { useStaffAlertSound } from "@/components/staff/useStaffAlertSound";
import { useStaffTabTitleAlert } from "@/components/staff/useStaffTabTitleAlert";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import { getRequestSummary } from "@/lib/staff/mock-data";
import type { StaffBillingStatus, StaffRequest, StaffRequestType, StaffRequestStatus } from "@/lib/staff/types";
import { isMassageBookingLikeRequest, isTechnicalRequestType } from "@/lib/staff/request-type-utils";
import { staffText, translateRequestType } from "@/lib/staff/ui-copy";
import { buildSurveyAlertRequests } from "@/lib/staff/survey-display";

type ReportView =
  | "requests_snapshot"
  | "top_requests"
  | "request_rooms"
  | "upsell_snapshot"
  | "issues_snapshot"
  | "top_issues"
  | "problem_rooms";

type DrilldownSelection =
  | { kind: "request_status"; status: "all" | "new" | "in_progress" | "completed" | "returned" | "open" }
  | { kind: "issue_status"; status: "new" | "in_progress" | "completed" | "returned" | "open" }
  | { kind: "request_type"; type: StaffRequestType }
  | { kind: "request_room"; room: string }
  | { kind: "upsell_status"; status: "all" | StaffBillingStatus }
  | { kind: "upsell_service"; serviceKey: string }
  | { kind: "upsell_room"; room: string }
  | { kind: "issue_type"; type: StaffRequestType }
  | { kind: "issue_room"; room: string };

type RequestTypeStat = {
  type: StaffRequestType;
  label: string;
  total: number;
  open: number;
  returned: number;
  completed: number;
};

type RoomStat = {
  room: string;
  total: number;
  open: number;
  returned: number;
  completed: number;
};


type UpsellServiceStat = {
  serviceKey: string;
  label: string;
  details: Array<{ label: string; count: number }>;
  chargedCount: number;
  pendingCount: number;
  waivedCount: number;
  cancelledCount: number;
  chargedRevenue: number;
  pendingRevenue: number;
  waivedRevenue: number;
  cancelledRevenue: number;
  currency: string;
};

type UpsellRoomStat = {
  room: string;
  chargedCount: number;
  pendingCount: number;
  waivedCount: number;
  cancelledCount: number;
  chargedRevenue: number;
  pendingRevenue: number;
  waivedRevenue: number;
  cancelledRevenue: number;
  currency: string;
};

function getUpsellText(lang: "bg" | "en" | "de") {
  if (lang === "en") {
    return {
      tab: "Upsell",
      title: "Upsell revenue",
      intro: "Additional paid services tracked by reception. Click a card to see the exact requests behind the number.",
      chargedRevenue: "Charged revenue",
      potentialRevenue: "Potential revenue",
      pendingRevenue: "Pending charge",
      waivedRevenue: "No-charge value",
      cancelledRevenue: "Cancelled value",
      chargedServices: "Charged services",
      pendingServices: "Pending services",
      waivedServices: "No-charge services",
      cancelledServices: "Cancelled services",
      byService: "Revenue by service",
      byRoom: "Revenue by room",
      noUpsellData: "No paid services have been requested yet.",
      service: "Service",
      details: "Exact item / details",
      charged: "Charged",
      pending: "Pending",
      waived: "No charge",
      cancelled: "Cancelled",
      revenue: "Revenue",
      pendingAmount: "Pending amount",
      waivedAmount: "No-charge value",
      cancelledAmount: "Cancelled value",
      upsellDetails: "Upsell details",
      allPaidServices: "All paid services",
    };
  }

  if (lang === "de") {
    return {
      tab: "Upsell",
      title: "Upsell-Umsatz",
      intro: "Zusätzliche kostenpflichtige Leistungen, die von der Rezeption verfolgt werden. Klicken Sie auf eine Karte, um die konkreten Anfragen zu sehen.",
      chargedRevenue: "Gebuchter Umsatz",
      potentialRevenue: "Möglicher Umsatz",
      pendingRevenue: "Offen zur Buchung",
      waivedRevenue: "Wert ohne Buchung",
      cancelledRevenue: "Stornierter Wert",
      chargedServices: "Gebuchte Leistungen",
      pendingServices: "Offene Leistungen",
      waivedServices: "Ohne Buchung",
      cancelledServices: "Stornierte Leistungen",
      byService: "Umsatz nach Leistung",
      byRoom: "Umsatz nach Zimmer",
      noUpsellData: "Es wurden noch keine kostenpflichtigen Leistungen angefragt.",
      service: "Leistung",
      details: "Genauer Artikel / Details",
      charged: "Gebucht",
      pending: "Offen",
      waived: "Ohne Buchung",
      cancelled: "Storniert",
      revenue: "Umsatz",
      pendingAmount: "Offener Betrag",
      waivedAmount: "Wert ohne Buchung",
      cancelledAmount: "Stornierter Wert",
      upsellDetails: "Upsell-Details",
      allPaidServices: "Alle kostenpflichtigen Leistungen",
    };
  }

  return {
    tab: "Upsell",
    title: "Upsell оборот",
    intro: "Допълнителни платени услуги, проследени от рецепция. Натиснете карта, за да видите конкретните заявки зад числото.",
    chargedRevenue: "Начислен оборот",
    potentialRevenue: "Потенциален оборот",
    pendingRevenue: "Чака начисляване",
    waivedRevenue: "Без начисляване",
    cancelledRevenue: "Отказана стойност",
    chargedServices: "Начислени услуги",
    pendingServices: "Чакащи услуги",
    waivedServices: "Без начисляване",
    cancelledServices: "Отказани услуги",
    byService: "Оборот по услуга",
    byRoom: "Оборот по стая",
    noUpsellData: "Все още няма заявени платени услуги.",
    service: "Услуга",
    details: "Точен артикул / детайл",
    charged: "Начислени",
    pending: "Чакащи",
    waived: "Без начисляване",
    cancelled: "Отказани",
    revenue: "Оборот",
    pendingAmount: "Чакаща сума",
    waivedAmount: "Стойност без начисляване",
    cancelledAmount: "Отказана сума",
    upsellDetails: "Детайл по upsell",
    allPaidServices: "Всички платени услуги",
  };
}

function parseMoney(value?: string | number | null) {
  if (value === null || value === undefined) return 0;
  const normalized = String(value)
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(amount: number, currency = "€") {
  const formatted = amount.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`.trim();
}

function isBillableRequest(request: StaffRequest) {
  return Boolean(request.requiresBilling) || parseMoney(request.price) > 0;
}

function getBillingStatus(request: StaffRequest): StaffBillingStatus {
  return request.billingStatus ?? "pending";
}

function isChargedRequest(request: StaffRequest) {
  return isBillableRequest(request) && getBillingStatus(request) === "charged";
}

function isPendingBillingRequest(request: StaffRequest) {
  return isBillableRequest(request) && getBillingStatus(request) === "pending";
}

function isWaivedBillingRequest(request: StaffRequest) {
  return isBillableRequest(request) && getBillingStatus(request) === "waived";
}

function isCancelledBillingRequest(request: StaffRequest) {
  return isBillableRequest(request) && getBillingStatus(request) === "cancelled";
}

function getRequestCurrency(request: StaffRequest) {
  return String(request.currency || "€").trim() || "€";
}

function getRequestAmount(request: StaffRequest) {
  return parseMoney(request.price);
}

const upsellServiceLabels: Record<"bg" | "en" | "de", Record<string, string>> = {
  bg: {
    coffee_capsules: "Кафе капсули",
    pillow_menu: "Меню възглавници",
    late_checkout: "Късен чек-аут",
    massage_booking: "Масаж / релакс терапия",
  },
  en: {
    coffee_capsules: "Coffee capsules",
    pillow_menu: "Pillow menu",
    late_checkout: "Late checkout",
    massage_booking: "Massage / relaxation therapy",
  },
  de: {
    coffee_capsules: "Kaffeekapseln",
    pillow_menu: "Kissenmenü",
    late_checkout: "Später Check-out",
    massage_booking: "Massage / Entspannungstherapie",
  },
};

function getUpsellServiceKey(request: StaffRequest) {
  const sourceRequestDef = String(request.sourceRequestDef || "").trim().toLowerCase();
  return sourceRequestDef || request.type;
}

function getUpsellServiceLabel(request: StaffRequest, lang: "bg" | "en" | "de") {
  const serviceKey = getUpsellServiceKey(request);
  const mapped = upsellServiceLabels[lang]?.[serviceKey];
  if (mapped) return mapped;

  const preciseLabel = String(request.typeLabel || "").trim();
  if (preciseLabel && serviceKey !== request.type) return preciseLabel;

  return translateRequestType(request.type, lang, preciseLabel);
}

function getUpsellRequestDetail(request: StaffRequest) {
  const serviceKey = getUpsellServiceKey(request);
  const note = String(request.note || "").trim();
  if (!note) return "";

  const lines = note.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const findValue = (patterns: RegExp[]) => {
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match?.[1]) return match[1].trim();
      }
    }
    return "";
  };

  if (serviceKey === "pillow_menu") {
    return findValue([
      /^Избрана възглавница:\s*(.+)$/i,
      /^Избрана услуга:\s*(.+)$/i,
      /^Избрана опция:\s*(.+)$/i,
    ]);
  }

  if (serviceKey === "massage_booking") {
    return findValue([
      /^Избрана услуга:\s*(.+)$/i,
      /^Избрана опция:\s*(.+)$/i,
    ]);
  }

  if (serviceKey === "coffee_capsules") {
    const quantity = findValue([/^Количество:\s*(.+)$/i]);
    return quantity ? `Количество: ${quantity}` : "";
  }

  if (serviceKey === "late_checkout") {
    const time = note.match(/\b([01]\d|2[0-3]):[0-5]\d\b/)?.[0] || "";
    return time ? `Час: ${time}` : "";
  }

  return "";
}

function buildUpsellServiceStats(requests: StaffRequest[], lang: "bg" | "en" | "de"): UpsellServiceStat[] {
  const map = new Map<string, UpsellServiceStat>();

  for (const request of requests.filter(isBillableRequest)) {
    const serviceKey = getUpsellServiceKey(request);
    const amount = getRequestAmount(request);
    const currency = getRequestCurrency(request);
    const existing = map.get(serviceKey) ?? {
      serviceKey,
      label: getUpsellServiceLabel(request, lang),
      details: [],
      chargedCount: 0,
      pendingCount: 0,
      waivedCount: 0,
      cancelledCount: 0,
      chargedRevenue: 0,
      pendingRevenue: 0,
      waivedRevenue: 0,
      cancelledRevenue: 0,
      currency,
    };

    const detail = getUpsellRequestDetail(request);
    if (detail) {
      const detailEntry = existing.details.find((item) => item.label === detail);
      if (detailEntry) detailEntry.count += 1;
      else existing.details.push({ label: detail, count: 1 });
    }

    const status = getBillingStatus(request);
    if (status === "charged") {
      existing.chargedCount += 1;
      existing.chargedRevenue += amount;
    } else if (status === "waived") {
      existing.waivedCount += 1;
      existing.waivedRevenue += amount;
    } else if (status === "cancelled") {
      existing.cancelledCount += 1;
      existing.cancelledRevenue += amount;
    } else {
      existing.pendingCount += 1;
      existing.pendingRevenue += amount;
    }

    map.set(serviceKey, existing);
  }

  return [...map.values()]
    .map((item) => ({
      ...item,
      details: [...item.details].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }))
    .sort(
      (a, b) => b.chargedRevenue - a.chargedRevenue || b.chargedCount - a.chargedCount || a.label.localeCompare(b.label),
    );
}

function buildUpsellRoomStats(requests: StaffRequest[]): UpsellRoomStat[] {
  const map = new Map<string, UpsellRoomStat>();

  for (const request of requests.filter(isBillableRequest)) {
    const amount = getRequestAmount(request);
    const currency = getRequestCurrency(request);
    const existing = map.get(request.room) ?? {
      room: request.room,
      chargedCount: 0,
      pendingCount: 0,
      waivedCount: 0,
      cancelledCount: 0,
      chargedRevenue: 0,
      pendingRevenue: 0,
      waivedRevenue: 0,
      cancelledRevenue: 0,
      currency,
    };

    const status = getBillingStatus(request);
    if (status === "charged") {
      existing.chargedCount += 1;
      existing.chargedRevenue += amount;
    } else if (status === "waived") {
      existing.waivedCount += 1;
      existing.waivedRevenue += amount;
    } else if (status === "cancelled") {
      existing.cancelledCount += 1;
      existing.cancelledRevenue += amount;
    } else {
      existing.pendingCount += 1;
      existing.pendingRevenue += amount;
    }

    map.set(request.room, existing);
  }

  return [...map.values()].sort(
    (a, b) => b.chargedRevenue - a.chargedRevenue || b.chargedCount - a.chargedCount || a.room.localeCompare(b.room, undefined, { numeric: true }),
  );
}

function isOpenStatus(status: StaffRequestStatus) {
  return status === "new" || status === "in_progress";
}

function isTechnicalProblem(request: StaffRequest) {
  return isTechnicalRequestType(request.type);
}

function sortByTime(requests: StaffRequest[], sort: "newest" | "oldest" = "newest") {
  const next = [...requests];
  return next.sort((a, b) => {
    const ta = new Date(a.createdAtIso).getTime();
    const tb = new Date(b.createdAtIso).getTime();
    return sort === "oldest" ? ta - tb : tb - ta;
  });
}

function buildRequestTypeStats(requests: StaffRequest[], lang: "bg" | "en" | "de"): RequestTypeStat[] {
  const map = new Map<StaffRequestType, RequestTypeStat>();

  for (const request of requests) {
    const existing = map.get(request.type) ?? {
      type: request.type,
      label: translateRequestType(request.type, lang, request.typeLabel),
      total: 0,
      open: 0,
      returned: 0,
      completed: 0,
    };

    existing.total += 1;
    if (isOpenStatus(request.status)) existing.open += 1;
    if (request.status === "returned") existing.returned += 1;
    if (request.status === "completed") existing.completed += 1;
    map.set(request.type, existing);
  }

  return [...map.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function buildRoomStats(requests: StaffRequest[]): RoomStat[] {
  const map = new Map<string, RoomStat>();

  for (const request of requests) {
    const entry = map.get(request.room) ?? {
      room: request.room,
      total: 0,
      open: 0,
      returned: 0,
      completed: 0,
    };

    entry.total += 1;
    if (isOpenStatus(request.status)) entry.open += 1;
    if (request.status === "returned") entry.returned += 1;
    if (request.status === "completed") entry.completed += 1;
    map.set(request.room, entry);
  }

  return [...map.values()].sort((a, b) => b.total - a.total || a.room.localeCompare(b.room, undefined, { numeric: true }));
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows: Array<Array<string | number>>) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function rowsToExcelHtml(title: string, rows: Array<Array<string | number>>) {
  const escape = (value: string | number) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");

  const body = rows
    .map(
      (row, rowIndex) =>
        `<tr>${row
          .map((cell) => `<${rowIndex === 0 ? "th" : "td"}>${escape(cell)}</${rowIndex === 0 ? "th" : "td"}>`)
          .join("")}</tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escape(title)}</title></head><body><table>${body}</table></body></html>`;
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ManagerPage() {
  const { lang } = useStaffUi();
  const t = staffText(lang);
  const {
    hotelSlug,
    getAllRequests,
    getOperationalAllRequests,
    updateRequestStatus,
    setRequestBillingStatus,
  } = useStaffStore();
  const requests = getAllRequests();
  const operationalRequests = useMemo(
    () => sortByTime(getOperationalAllRequests()),
    [getOperationalAllRequests],
  );
  const {
    activeSurveys: managerActiveSurveys,
    reportSurveys: managerReportSurveys,
    markingId: markingSurveyId,
    markSurveyRead,
  } = useStaffSurveys({ hotelSlug, role: "manager" });
  const managerSurveyAlertRequests = useMemo(
    () => buildSurveyAlertRequests(managerActiveSurveys),
    [managerActiveSurveys],
  );
  const managerAlertRequests = useMemo(
    () => [...operationalRequests, ...managerSurveyAlertRequests],
    [managerSurveyAlertRequests, operationalRequests],
  );
  const { soundEnabled, toggleSound } = useStaffAlertSound({
    hotelSlug,
    department: "manager",
    requests: managerAlertRequests,
  });

  useStaffTabTitleAlert(managerAlertRequests);
  const [activeReport, setActiveReport] = useState<ReportView>("requests_snapshot");
  const [selectedDrilldown, setSelectedDrilldown] = useState<DrilldownSelection | null>(null);
  const summary = useMemo(() => getRequestSummary(requests), [requests]);
  const problemRequests = useMemo(() => requests.filter(isTechnicalProblem), [requests]);
  const problemSummary = useMemo(() => getRequestSummary(problemRequests), [problemRequests]);

  const requestTypeStats = useMemo(() => buildRequestTypeStats(requests, lang), [requests, lang]);
  const issueTypeStats = useMemo(() => buildRequestTypeStats(problemRequests, lang), [problemRequests, lang]);
  const requestRoomStats = useMemo(() => buildRoomStats(requests), [requests]);
  const problemRoomStats = useMemo(() => buildRoomStats(problemRequests), [problemRequests]);

  const upsellText = useMemo(() => getUpsellText(lang), [lang]);
  const billableRequests = useMemo(() => requests.filter(isBillableRequest), [requests]);
  const chargedUpsellRequests = useMemo(() => billableRequests.filter(isChargedRequest), [billableRequests]);
  const pendingUpsellRequests = useMemo(() => billableRequests.filter(isPendingBillingRequest), [billableRequests]);
  const waivedUpsellRequests = useMemo(() => billableRequests.filter(isWaivedBillingRequest), [billableRequests]);
  const cancelledUpsellRequests = useMemo(() => billableRequests.filter(isCancelledBillingRequest), [billableRequests]);
  const upsellCurrency = billableRequests.find((request) => getRequestCurrency(request))?.currency || "€";
  const chargedUpsellRevenue = useMemo(
    () => chargedUpsellRequests.reduce((sum, request) => sum + getRequestAmount(request), 0),
    [chargedUpsellRequests],
  );
  const pendingUpsellRevenue = useMemo(
    () => pendingUpsellRequests.reduce((sum, request) => sum + getRequestAmount(request), 0),
    [pendingUpsellRequests],
  );
  const waivedUpsellRevenue = useMemo(
    () => waivedUpsellRequests.reduce((sum, request) => sum + getRequestAmount(request), 0),
    [waivedUpsellRequests],
  );
  const cancelledUpsellRevenue = useMemo(
    () => cancelledUpsellRequests.reduce((sum, request) => sum + getRequestAmount(request), 0),
    [cancelledUpsellRequests],
  );
  const potentialUpsellRevenue = chargedUpsellRevenue + pendingUpsellRevenue + waivedUpsellRevenue + cancelledUpsellRevenue;
  const upsellServiceStats = useMemo(() => buildUpsellServiceStats(requests, lang), [requests, lang]);
  const upsellRoomStats = useMemo(() => buildUpsellRoomStats(requests), [requests]);

  const reportTabs = [
    { id: "requests_snapshot" as const, label: t.requestsSnapshot },
    { id: "top_requests" as const, label: t.topRequestTypes },
    { id: "request_rooms" as const, label: t.requestHeavyRooms },
    { id: "upsell_snapshot" as const, label: upsellText.tab },
    { id: "issues_snapshot" as const, label: t.problemsSnapshot },
    { id: "top_issues" as const, label: t.topProblemTypes },
    { id: "problem_rooms" as const, label: t.problematicRooms },
  ];

  const drilldownData = useMemo(() => {
    if (!selectedDrilldown) return null;

    switch (selectedDrilldown.kind) {
      case "request_status": {
        const matching = sortByTime(requests.filter((request) => {
          if (selectedDrilldown.status === "all") return true;
          if (selectedDrilldown.status === "open") return isOpenStatus(request.status);
          return request.status === selectedDrilldown.status;
        }));
        return { title: t.reportDetails, subtitle: t.reportDetailsIntro, requests: matching };
      }
      case "issue_status": {
        const matching = sortByTime(problemRequests.filter((request) => {
          if (selectedDrilldown.status === "open") return isOpenStatus(request.status);
          return request.status === selectedDrilldown.status;
        }));
        return { title: t.reportDetails, subtitle: t.reportDetailsIntro, requests: matching };
      }
      case "request_type":
        return {
          title: translateRequestType(selectedDrilldown.type, lang),
          subtitle: t.topRequestTypesText,
          requests: sortByTime(requests.filter((request) => request.type === selectedDrilldown.type)),
        };
      case "request_room":
        return {
          title: `${t.room} ${selectedDrilldown.room}`,
          subtitle: t.requestRoomsText,
          requests: sortByTime(requests.filter((request) => request.room === selectedDrilldown.room)),
        };
      case "upsell_status": {
        const matching = sortByTime(billableRequests.filter((request) => {
          if (selectedDrilldown.status === "all") return true;
          return getBillingStatus(request) === selectedDrilldown.status;
        }));
        const title = selectedDrilldown.status === "all"
          ? upsellText.allPaidServices
          : selectedDrilldown.status === "charged"
            ? upsellText.chargedServices
            : selectedDrilldown.status === "waived"
              ? upsellText.waivedServices
              : selectedDrilldown.status === "cancelled"
                ? upsellText.cancelledServices
                : upsellText.pendingServices;
        return { title, subtitle: upsellText.intro, requests: matching };
      }
      case "upsell_service": {
        const matching = sortByTime(
          billableRequests.filter((request) => getUpsellServiceKey(request) === selectedDrilldown.serviceKey),
        );
        return {
          title: matching[0] ? getUpsellServiceLabel(matching[0], lang) : selectedDrilldown.serviceKey.replace(/_/g, " "),
          subtitle: upsellText.byService,
          requests: matching,
        };
      }
      case "upsell_room":
        return {
          title: `${t.room} ${selectedDrilldown.room}`,
          subtitle: upsellText.byRoom,
          requests: sortByTime(billableRequests.filter((request) => request.room === selectedDrilldown.room)),
        };
      case "issue_type":
        return {
          title: translateRequestType(selectedDrilldown.type, lang),
          subtitle: t.problemTypesText,
          requests: sortByTime(problemRequests.filter((request) => request.type === selectedDrilldown.type)),
        };
      case "issue_room":
        return {
          title: `${t.room} ${selectedDrilldown.room}`,
          subtitle: t.problemRoomText,
          requests: sortByTime(problemRequests.filter((request) => request.room === selectedDrilldown.room)),
        };
    }
  }, [billableRequests, lang, problemRequests, requests, selectedDrilldown, t, upsellText]);

  const reportRows = useMemo(() => {
    switch (activeReport) {
      case "requests_snapshot":
        return [
          [t.room, t.requestType, "Status", "Date", "Time"],
          ...sortByTime(requests).map((request) => {
            const created = new Date(request.createdAtIso);
            return [
              `${t.room} ${request.room}`,
              translateRequestType(request.type, lang, request.typeLabel),
              request.status,
              created.toLocaleDateString(lang),
              created.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }),
            ];
          }),
        ];
      case "top_requests":
        return [[t.requestType, t.totalRequests, t.openRequests, t.returnedRequests, t.completedRequests], ...requestTypeStats.map((item) => [item.label, item.total, item.open, item.returned, item.completed])];
      case "request_rooms":
        return [[t.room, t.totalRequests, t.openRequests, t.returnedRequests, t.completedRequests], ...requestRoomStats.map((room) => [`${t.room} ${room.room}`, room.total, room.open, room.returned, room.completed])];
      case "upsell_snapshot":
        return [
          [upsellText.service, upsellText.details, upsellText.charged, upsellText.revenue, upsellText.pending, upsellText.pendingAmount, upsellText.waived, upsellText.cancelled],
          ...upsellServiceStats.map((item) => [
            item.label,
            item.details.map((detail) => detail.count > 1 ? `${detail.label} × ${detail.count}` : detail.label).join(" · "),
            item.chargedCount,
            formatMoney(item.chargedRevenue, item.currency),
            item.pendingCount,
            formatMoney(item.pendingRevenue, item.currency),
            item.waivedCount,
            item.cancelledCount,
          ]),
        ];
      case "issues_snapshot":
        return [
          [t.room, t.problemType, "Status", "Date", "Time"],
          ...sortByTime(problemRequests).map((request) => {
            const created = new Date(request.createdAtIso);
            return [
              `${t.room} ${request.room}`,
              translateRequestType(request.type, lang, request.typeLabel),
              request.status,
              created.toLocaleDateString(lang),
              created.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }),
            ];
          }),
        ];
      case "top_issues":
        return [[t.problemType, t.totalIssues, t.openIssues, t.returnedIssues, t.completedIssues], ...issueTypeStats.map((item) => [item.label, item.total, item.open, item.returned, item.completed])];
      case "problem_rooms":
        return [[t.room, t.totalIssues, t.openIssues, t.returnedIssues, t.completedIssues], ...problemRoomStats.map((room) => [`${t.room} ${room.room}`, room.total, room.open, room.returned, room.completed])];
    }
  }, [activeReport, issueTypeStats, lang, problemRequests, problemRoomStats, requestRoomStats, requestTypeStats, requests, t, upsellServiceStats, upsellText]);

  function exportCsv() {
    downloadFile(`manager-${activeReport}.csv`, rowsToCsv(reportRows), "text/csv;charset=utf-8;");
  }

  function exportExcel() {
    const activeLabel = reportTabs.find((tab) => tab.id === activeReport)?.label ?? t.reports;
    downloadFile(`manager-${activeReport}.xls`, rowsToExcelHtml(activeLabel, reportRows), "application/vnd.ms-excel;charset=utf-8;");
  }

  return (
    <main className="space-y-6 pb-safe">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{t.managerDashboard}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">{t.managerIntro}</p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-sm text-violet-100">
              {t.allDepartmentsOverview}
            </div>
            <StaffAlertSoundButton soundEnabled={soundEnabled} onToggle={toggleSound} />
          </div>
        </div>
      </section>

      {hotelSlug ? <ManagerPwaControls hotelSlug={hotelSlug} /> : null}

      <ManagerTodaySurveysCard
        surveys={managerActiveSurveys}
        lang={lang}
        markingId={markingSurveyId}
        onMarkRead={(id) => void markSurveyRead(id)}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StaffSummaryCard label={t.total} value={summary.total} onClick={() => setSelectedDrilldown({ kind: "request_status", status: "all" })} />
        <StaffSummaryCard label={t.new} value={summary.newCount} onClick={() => setSelectedDrilldown({ kind: "request_status", status: "new" })} />
        <StaffSummaryCard label={t.inProgress} value={summary.inProgressCount} onClick={() => setSelectedDrilldown({ kind: "request_status", status: "in_progress" })} />
        <StaffSummaryCard label={t.completed} value={summary.completedCount} onClick={() => setSelectedDrilldown({ kind: "request_status", status: "completed" })} />
        <StaffSummaryCard label={t.returned} value={summary.returnedCount} danger onClick={() => setSelectedDrilldown({ kind: "request_status", status: "returned" })} />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/40">{t.active}</p>
          <h3 className="mt-1 text-xl font-semibold text-white">{t.managerOperationsTitle}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
            {t.managerOperationsIntro}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {operationalRequests.length ? (
            operationalRequests.map((request) => (
              <StaffRequestCard
                key={`manager-operational-${request.id}`}
                request={request}
                mode="manager"
                canAct
                forceBillingOnly={isMassageBookingLikeRequest(request)}
                canCharge
                onStart={(id) => void updateRequestStatus(id, "in_progress")}
                onDone={(id) => void updateRequestStatus(id, "completed")}
                onReturn={(id) => void updateRequestStatus(id, "returned")}
                onCharge={(id) => void setRequestBillingStatus(id, "charged")}
                onWaive={(id) => void setRequestBillingStatus(id, "waived")}
                onCancelBilling={(id) => void setRequestBillingStatus(id, "cancelled")}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">
              {t.noManagerOperationalRequests}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/40">{t.reportsCompactLabel}</p>
            <h3 className="mt-1 text-xl font-semibold text-white">{t.reports}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">{t.reportsCompactIntro}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportCsv} className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/20 hover:bg-black/30">{t.exportCsv}</button>
            <button type="button" onClick={exportExcel} className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:border-emerald-300/30 hover:bg-emerald-400/15">{t.exportExcel}</button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {reportTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveReport(tab.id);
                setSelectedDrilldown(null);
              }}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${activeReport === tab.id ? "border-violet-300/40 bg-violet-300/15 text-violet-100" : "border-white/10 bg-black/20 text-white/75 hover:border-white/20 hover:bg-black/30"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
          {activeReport === "requests_snapshot" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <button type="button" onClick={() => setSelectedDrilldown({ kind: "request_status", status: "new" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30"><p className="text-sm text-white/50">{t.new}</p><p className="mt-2 text-3xl font-semibold text-white">{summary.newCount}</p></button>
              <button type="button" onClick={() => setSelectedDrilldown({ kind: "request_status", status: "in_progress" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30"><p className="text-sm text-white/50">{t.inProgress}</p><p className="mt-2 text-3xl font-semibold text-white">{summary.inProgressCount}</p></button>
              <button type="button" onClick={() => setSelectedDrilldown({ kind: "request_status", status: "returned" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30"><p className="text-sm text-white/50">{t.returned}</p><p className="mt-2 text-3xl font-semibold text-white">{summary.returnedCount}</p></button>
              <button type="button" onClick={() => setSelectedDrilldown({ kind: "request_status", status: "completed" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30"><p className="text-sm text-white/50">{t.completed}</p><p className="mt-2 text-3xl font-semibold text-white">{summary.completedCount}</p></button>
              <button type="button" onClick={() => setSelectedDrilldown({ kind: "request_status", status: "all" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30"><p className="text-sm text-white/50">{t.total}</p><p className="mt-2 text-3xl font-semibold text-white">{summary.total}</p></button>
            </div>
          ) : null}

          {activeReport === "top_requests" ? (
            requestTypeStats.length ? (
              <div className="space-y-3">
                {requestTypeStats.map((item) => (
                  <button key={item.type} type="button" onClick={() => setSelectedDrilldown({ kind: "request_type", type: item.type })} className="grid w-full gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:items-center">
                    <div><p className="font-medium text-white">{item.label}</p></div>
                    <div className="text-sm text-white/60">{t.totalRequests}: <span className="font-semibold text-white">{item.total}</span></div>
                    <div className="text-sm text-white/60">{t.openRequests}: <span className="font-semibold text-white">{item.open}</span></div>
                    <div className="text-sm text-white/60">{t.returnedRequests}: <span className="font-semibold text-white">{item.returned}</span></div>
                    <div className="text-sm text-white/60">{t.completedRequests}: <span className="font-semibold text-white">{item.completed}</span></div>
                  </button>
                ))}
              </div>
            ) : <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">{t.noRequestData}</div>
          ) : null}

          {activeReport === "request_rooms" ? (
            requestRoomStats.length ? (
              <div className="space-y-3">
                {requestRoomStats.map((room) => (
                  <button key={room.room} type="button" onClick={() => setSelectedDrilldown({ kind: "request_room", room: room.room })} className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{t.room} {room.room}</p>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">{t.totalRequests} {room.total}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/65">
                      <span>{t.openRequests}: <span className="font-semibold text-white">{room.open}</span></span>
                      <span>{t.returnedRequests}: <span className="font-semibold text-white">{room.returned}</span></span>
                      <span>{t.completedRequests}: <span className="font-semibold text-white">{room.completed}</span></span>
                    </div>
                  </button>
                ))}
              </div>
            ) : <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">{t.noRequestData}</div>
          ) : null}

          {activeReport === "upsell_snapshot" ? (
            billableRequests.length ? (
              <div className="space-y-5">
                <div>
                  <h4 className="text-lg font-semibold text-white">{upsellText.title}</h4>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">{upsellText.intro}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <button type="button" onClick={() => setSelectedDrilldown({ kind: "upsell_status", status: "charged" })} className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-left transition hover:border-emerald-300/40 hover:bg-emerald-300/15">
                    <p className="text-sm text-emerald-100/75">{upsellText.chargedRevenue}</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{formatMoney(chargedUpsellRevenue, upsellCurrency)}</p>
                    <p className="mt-1 text-xs text-emerald-100/60">{chargedUpsellRequests.length} {upsellText.charged}</p>
                  </button>
                  <button type="button" onClick={() => setSelectedDrilldown({ kind: "upsell_status", status: "pending" })} className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-left transition hover:border-amber-300/40 hover:bg-amber-300/15">
                    <p className="text-sm text-amber-100/75">{upsellText.pendingRevenue}</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{formatMoney(pendingUpsellRevenue, upsellCurrency)}</p>
                    <p className="mt-1 text-xs text-amber-100/60">{pendingUpsellRequests.length} {upsellText.pending}</p>
                  </button>
                  <button type="button" onClick={() => setSelectedDrilldown({ kind: "upsell_status", status: "waived" })} className="rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4 text-left transition hover:border-sky-300/40 hover:bg-sky-300/15">
                    <p className="text-sm text-sky-100/75">{upsellText.waivedRevenue}</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{formatMoney(waivedUpsellRevenue, upsellCurrency)}</p>
                    <p className="mt-1 text-xs text-sky-100/60">{waivedUpsellRequests.length} {upsellText.waived}</p>
                  </button>
                  <button type="button" onClick={() => setSelectedDrilldown({ kind: "upsell_status", status: "cancelled" })} className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4 text-left transition hover:border-rose-300/40 hover:bg-rose-300/15">
                    <p className="text-sm text-rose-100/75">{upsellText.cancelledRevenue}</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{formatMoney(cancelledUpsellRevenue, upsellCurrency)}</p>
                    <p className="mt-1 text-xs text-rose-100/60">{cancelledUpsellRequests.length} {upsellText.cancelled}</p>
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <button type="button" onClick={() => setSelectedDrilldown({ kind: "upsell_status", status: "all" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30">
                    <p className="text-sm text-white/50">{upsellText.potentialRevenue}</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{formatMoney(potentialUpsellRevenue, upsellCurrency)}</p>
                  </button>
                  <button type="button" onClick={() => setSelectedDrilldown({ kind: "upsell_status", status: "charged" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30">
                    <p className="text-sm text-white/50">{upsellText.chargedServices}</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{chargedUpsellRequests.length}</p>
                  </button>
                  <button type="button" onClick={() => setSelectedDrilldown({ kind: "upsell_status", status: "pending" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30">
                    <p className="text-sm text-white/50">{upsellText.pendingServices}</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{pendingUpsellRequests.length}</p>
                  </button>
                  <button type="button" onClick={() => setSelectedDrilldown({ kind: "upsell_status", status: "waived" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30">
                    <p className="text-sm text-white/50">{upsellText.waivedServices}</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{waivedUpsellRequests.length}</p>
                  </button>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <h5 className="font-semibold text-white">{upsellText.byService}</h5>
                    <div className="mt-4 space-y-3">
                      {upsellServiceStats.map((item) => (
                        <button
                          key={item.serviceKey}
                          type="button"
                          onClick={() => setSelectedDrilldown({ kind: "upsell_service", serviceKey: item.serviceKey })}
                          className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-emerald-300/30 hover:bg-white/10"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-white">{item.label}</p>
                            <p className="font-semibold text-emerald-100">{formatMoney(item.chargedRevenue, item.currency)}</p>
                          </div>
                          <p className="mt-2 text-sm text-white/60">
                            {upsellText.charged}: <span className="font-semibold text-white">{item.chargedCount}</span>
                            {" · "}{upsellText.pending}: <span className="font-semibold text-white">{item.pendingCount}</span>
                            {" · "}{upsellText.waived}: <span className="font-semibold text-white">{item.waivedCount}</span>
                            {" · "}{upsellText.cancelled}: <span className="font-semibold text-white">{item.cancelledCount}</span>
                          </p>
                          {item.details.length ? (
                            <p className="mt-2 text-xs leading-5 text-white/50">
                              {item.details.map((detail) => detail.count > 1 ? `${detail.label} × ${detail.count}` : detail.label).join(" · ")}
                            </p>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <h5 className="font-semibold text-white">{upsellText.byRoom}</h5>
                    <div className="mt-4 space-y-3">
                      {upsellRoomStats.map((room) => (
                        <button
                          key={room.room}
                          type="button"
                          onClick={() => setSelectedDrilldown({ kind: "upsell_room", room: room.room })}
                          className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-emerald-300/30 hover:bg-white/10"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-white">{t.room} {room.room}</p>
                            <p className="font-semibold text-emerald-100">{formatMoney(room.chargedRevenue, room.currency)}</p>
                          </div>
                          <p className="mt-2 text-sm text-white/60">
                            {upsellText.charged}: <span className="font-semibold text-white">{room.chargedCount}</span>
                            {" · "}{upsellText.pending}: <span className="font-semibold text-white">{room.pendingCount}</span>
                            {" · "}{upsellText.waived}: <span className="font-semibold text-white">{room.waivedCount}</span>
                            {" · "}{upsellText.cancelled}: <span className="font-semibold text-white">{room.cancelledCount}</span>
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">{upsellText.noUpsellData}</div>
          ) : null}

          {activeReport === "issues_snapshot" ? (
            problemRequests.length ? (
              <div className="space-y-3">
                {sortByTime(problemRequests).map((request) => {
                  const created = new Date(request.createdAtIso);
                  return (
                    <button key={request.id} type="button" onClick={() => setSelectedDrilldown({ kind: "issue_type", type: request.type })} className="grid w-full gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                      <div><p className="font-medium text-white">{translateRequestType(request.type, lang, request.typeLabel)}</p></div>
                      <div className="text-sm text-white/60">{t.room}: <span className="font-semibold text-white">{request.room}</span></div>
                      <div className="text-sm text-white/60">{created.toLocaleDateString(lang)} • {created.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}</div>
                      <div className="text-sm text-white/60">{request.status}</div>
                    </button>
                  );
                })}
              </div>
            ) : <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">{t.noProblemData}</div>
          ) : null}

          {activeReport === "top_issues" ? (
            issueTypeStats.length ? (
              <div className="space-y-3">
                {issueTypeStats.map((item) => (
                  <button key={item.type} type="button" onClick={() => setSelectedDrilldown({ kind: "issue_type", type: item.type })} className="grid w-full gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:items-center">
                    <div><p className="font-medium text-white">{item.label}</p></div>
                    <div className="text-sm text-white/60">{t.totalIssues}: <span className="font-semibold text-white">{item.total}</span></div>
                    <div className="text-sm text-white/60">{t.openIssues}: <span className="font-semibold text-white">{item.open}</span></div>
                    <div className="text-sm text-white/60">{t.returnedIssues}: <span className="font-semibold text-white">{item.returned}</span></div>
                    <div className="text-sm text-white/60">{t.completedIssues}: <span className="font-semibold text-white">{item.completed}</span></div>
                  </button>
                ))}
              </div>
            ) : <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">{t.noProblemData}</div>
          ) : null}

          {activeReport === "problem_rooms" ? (
            problemRoomStats.length ? (
              <div className="space-y-3">
                {problemRoomStats.map((room) => (
                  <button key={room.room} type="button" onClick={() => setSelectedDrilldown({ kind: "issue_room", room: room.room })} className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{t.room} {room.room}</p>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">{t.totalIssues} {room.total}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/65">
                      <span>{t.openIssues}: <span className="font-semibold text-white">{room.open}</span></span>
                      <span>{t.returnedIssues}: <span className="font-semibold text-white">{room.returned}</span></span>
                      <span>{t.completedIssues}: <span className="font-semibold text-white">{room.completed}</span></span>
                    </div>
                  </button>
                ))}
              </div>
            ) : <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">{t.noProblemData}</div>
          ) : null}
        </div>

        {selectedDrilldown && drilldownData ? (
          <div className="mt-5 rounded-2xl border border-violet-300/25 bg-violet-300/5 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-violet-100/70">{t.reportDetails}</p>
                <h4 className="mt-1 text-xl font-semibold text-white">{drilldownData.title}</h4>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">{drilldownData.subtitle}</p>
              </div>
              <button type="button" onClick={() => setSelectedDrilldown(null)} className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/20 hover:bg-black/30">{t.closeDetails}</button>
            </div>

            <div className="mt-4 space-y-4">
              {drilldownData.requests.length ? (
                drilldownData.requests.map((request) => (
                  <StaffRequestCard key={`${selectedDrilldown.kind}-${request.id}`} request={request} mode="manager" />
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">{t.reportDetailsEmpty}</div>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <ManagerSurveyReportCard surveys={managerReportSurveys} lang={lang} />
    </main>
  );
}
