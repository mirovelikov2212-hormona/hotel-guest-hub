import type { Day3Survey, Day3SurveyResolutionStatus } from "@/lib/staff/survey-types";
import type { StaffRequest } from "@/lib/staff/types";

export type StaffSurveyLang = "bg" | "en" | "de";

const CATEGORY_LABELS: Record<StaffSurveyLang, Record<string, string>> = {
  bg: {
    room: "Стая",
    cleanliness: "Чистота",
    food_restaurant: "Храна и ресторант",
    pool: "Басейн",
    beach: "Плаж",
    staff_service: "Персонал и обслужване",
    noise: "Шум",
    hotel_services: "Услуги в хотела",
    value_for_money: "Цена спрямо условията",
    other: "Друго",
  },
  en: {
    room: "Room",
    cleanliness: "Cleanliness",
    food_restaurant: "Food & restaurant",
    pool: "Pool",
    beach: "Beach",
    staff_service: "Staff & service",
    noise: "Noise",
    hotel_services: "Hotel services",
    value_for_money: "Value for money",
    other: "Other",
  },
  de: {
    room: "Zimmer",
    cleanliness: "Sauberkeit",
    food_restaurant: "Essen & Restaurant",
    pool: "Pool",
    beach: "Strand",
    staff_service: "Personal & Service",
    noise: "Lärm",
    hotel_services: "Hotelleistungen",
    value_for_money: "Preis-Leistungs-Verhältnis",
    other: "Sonstiges",
  },
};

const RESOLUTION_LABELS: Record<StaffSurveyLang, Record<Day3SurveyResolutionStatus, string>> = {
  bg: {
    fully_resolved: "Да, решен е напълно",
    partially_resolved: "Частично",
    not_resolved: "Не, все още не е решен",
    not_informed: "Не съм уведомявал/а екипа",
  },
  en: {
    fully_resolved: "Yes, fully resolved",
    partially_resolved: "Partially",
    not_resolved: "No, not resolved yet",
    not_informed: "I did not inform the team",
  },
  de: {
    fully_resolved: "Ja, vollständig gelöst",
    partially_resolved: "Teilweise",
    not_resolved: "Nein, noch nicht gelöst",
    not_informed: "Ich habe das Team nicht informiert",
  },
};

export function getSurveyCategoryLabel(key: string, lang: StaffSurveyLang) {
  return CATEGORY_LABELS[lang]?.[key] || CATEGORY_LABELS.bg[key] || key.replace(/_/g, " ");
}

export function getSurveyResolutionLabel(status: Day3SurveyResolutionStatus | null, lang: StaffSurveyLang) {
  if (!status) return lang === "de" ? "Nicht angegeben" : lang === "en" ? "Not specified" : "Не е посочено";
  return RESOLUTION_LABELS[lang]?.[status] || RESOLUTION_LABELS.bg[status] || status.replace(/_/g, " ");
}

export function isCriticalSurvey(survey: Day3Survey) {
  return survey.rating <= 3;
}

export function surveyNeedsAttention(survey: Day3Survey) {
  return (
    survey.rating <= 3 ||
    survey.resolutionStatus === "partially_resolved" ||
    survey.resolutionStatus === "not_resolved" ||
    survey.resolutionStatus === "not_informed"
  );
}

export function formatSurveyDateTime(iso: string, lang: StaffSurveyLang) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";

  return date.toLocaleString(lang === "bg" ? "bg-BG" : lang === "de" ? "de-DE" : "en-GB", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildSurveyAlertRequests(
  surveys: Day3Survey[],
  options?: { forceNew?: boolean; notifyDepartments?: StaffRequest["notifyDepartments"] },
): StaffRequest[] {
  return surveys.map((survey) => ({
    id: `survey-${survey.id}`,
    room: survey.room,
    department: "reception",
    type: "information_request",
    typeLabel: `Анкета Ден 3 · оценка ${survey.rating}/5`,
    status: options?.forceNew ? "new" : survey.managerReadAt ? "completed" : "new",
    serviceTime: "now",
    createdAt: formatSurveyDateTime(survey.guestSubmittedAt, "bg"),
    createdAtIso: survey.guestSubmittedAt,
    createdDateKey: survey.hotelDateKey,
    note: survey.problemText || survey.improvementText || undefined,
    requiresBilling: false,
    sourceRequestDef: "day3_guest_survey",
    notifyDepartments: options?.notifyDepartments || ["manager"],
  }));
}
