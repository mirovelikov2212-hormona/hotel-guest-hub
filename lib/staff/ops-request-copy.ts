import type { StaffDepartment, StaffRequestType } from "@/lib/staff/types";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";

type RequestMetadata = {
  department?: StaffDepartment;
  serviceTime?: string;
  typeLabel?: string;
  note?: string | null;
  rawType?: string | null;
  sourceRequestDef?: string | null;
  requiresBilling?: boolean;
  price?: string | null;
  currency?: string | null;
  notifyDepartments?: string[];
};

type OperationalCopyInput = {
  requestType?: string | null;
  title?: string | null;
  message?: string | null;
  metadata?: RequestMetadata | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-]+/g, "_");
}

function collectSignals(input: OperationalCopyInput) {
  const metadata = input.metadata ?? {};
  return [
    input.requestType,
    input.title,
    input.message,
    metadata.typeLabel,
    metadata.note,
    metadata.rawType,
    metadata.sourceRequestDef,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" | ");
}

function detectSpecificKey(
  normalizedType: StaffRequestType,
  input: OperationalCopyInput
): string {
  const signals = collectSignals(input);

  if (/coffee_capsules|capsule|capsule_de_cafea|kafe_kapsuli|кафе_капсули/.test(signals)) {
    return "coffee_capsules";
  }

  if (/pillow_menu|menu_vazglav|меню_възглавници|perne|polstar/.test(signals)) {
    return "pillow_menu";
  }

  if (/special_occasion|occasion|ocazie|prilezitost|повод|birthday|anniversary|narozen/.test(signals)) {
    return "special_occasion";
  }

  if (/coffee_machine|kafe_mashina|кафе_машина|kavovar|aparat_de_cafea/.test(signals)) {
    return "coffee_machine";
  }

  if (/minibar_not_cooling|minibar.*cool|minibar.*race|охлажда|не_охлажда/.test(signals)) {
    return "minibar_not_cooling";
  }

  if (/room_cleaning|почистване|curatenie|uklid/.test(signals)) {
    return "room_cleaning_request";
  }

  return normalizedType;
}

const STAFF_TITLES_BG: Record<string, string> = {
  towels: "Хавлии",
  toilet_paper: "Тоалетна хартия",
  extra_pillow: "Допълнителна възглавница",
  extra_blanket: "Допълнително одеяло",
  bathrobe: "Халат",
  slippers: "Чехли",
  baby_cot: "Бебешко легло",
  iron: "Ютия и дъска",
  minibar: "Зареждане минибар",
  minibar_refill: "Зареждане минибар",
  laundry: "Пране",
  room_cleaning_request: "Почистване на стая",
  other_housekeeping: "Housekeeping заявка",

  coffee_capsules: "Кафе капсули",
  pillow_menu: "Меню възглавници",

  air_conditioning: "Климатик / отопление",
  light_not_working: "Проблем с осветлението",
  no_hot_water: "Проблем с водата",
  tv_issue: "Проблем с телевизора",
  bathroom_issue: "Проблем в банята",
  door_lock_issue: "Проблем с врата / ключалка",
  wifi_issue: "Проблем с Wi-Fi",
  power_outlet_issue: "Проблем с контакт",
  safe_issue: "Проблем със сейфа",
  balcony_door_issue: "Проблем с балконска врата",
  minibar_not_cooling: "Минибарът не охлажда",
  coffee_machine: "Кафе машина",
  other_technical_issue: "Нещо е счупено",

  taxi: "Такси",
  late_checkout: "Късен check-out",
  wake_up_call: "Събуждане",
  information: "Въпрос към рецепция",
  information_request: "Въпрос към рецепция",
  reservation_help: "Помощ с резервация",
  other_reception: "Заявка към рецепция",
  restaurant_reservation: "Резервация",
  luggage_help: "Помощ с багаж",
  special_occasion: "Специален повод",
};

const STAFF_NOTES_BG: Record<string, string> = {
  towels: "Гостът има нужда от хавлии.",
  toilet_paper: "Гостът има нужда от тоалетна хартия.",
  extra_pillow: "Гостът има нужда от допълнителна възглавница.",
  extra_blanket: "Гостът има нужда от допълнително одеяло.",
  bathrobe: "Гостът има нужда от халат.",
  slippers: "Гостът има нужда от чехли.",
  baby_cot: "Гостът има нужда от бебешко легло.",
  iron: "Гостът има нужда от ютия и дъска.",
  minibar: "Платена услуга: зареждане на минибар. Рецепцията трябва да начисли услугата към сметката на стаята.",
  minibar_refill: "Платена услуга: зареждане на минибар. Рецепцията трябва да начисли услугата към сметката на стаята.",
  laundry: "Платена услуга: пране. Рецепцията трябва да начисли услугата към сметката на стаята.",
  coffee_capsules: "Платена услуга: кафе капсули. Housekeeping доставя, рецепцията начислява към сметката на стаята.",
  pillow_menu: "Платена услуга: меню възглавници. Housekeeping доставя, рецепцията начислява към сметката на стаята.",
  coffee_machine: "Гостът съобщи за проблем с кафе машината.",
  minibar_not_cooling: "Гостът съобщи, че минибарът не охлажда.",
};

function looksSystemGenerated(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return false;

  return (
    normalized.includes("guest_reported") ||
    normalized.includes("paid_service") ||
    normalized.includes("serviciu_contra_cost") ||
    normalized.includes("placena_sluzba") ||
    normalized.includes("kostenpflichtiger_service") ||
    normalized.includes("услугата") ||
    normalized.includes("платена_услуга") ||
    normalized.includes("charged_to_the_room") ||
    normalized.includes("room_account") ||
    normalized.includes("сметката_на_стаята")
  );
}

export function getOperationalRequestTitleBg(input: OperationalCopyInput): string {
  const metadata = input.metadata ?? {};
  const normalizedType = normalizeStaffRequestType(
    String(input.requestType || metadata.rawType || ""),
    metadata.department
  );
  const key = detectSpecificKey(normalizedType, input);

  return STAFF_TITLES_BG[key] ?? STAFF_TITLES_BG[normalizedType] ?? "Заявка";
}

export function getOperationalRequestNoteBg(input: OperationalCopyInput): string | undefined {
  const metadata = input.metadata ?? {};
  const normalizedType = normalizeStaffRequestType(
    String(input.requestType || metadata.rawType || ""),
    metadata.department
  );
  const key = detectSpecificKey(normalizedType, input);

  const originalNote = String(metadata.note ?? input.message ?? "").trim();
  const billingNotice = metadata.requiresBilling
    ? "Платена услуга. Рецепцията трябва да начисли услугата към сметката на стаята."
    : "";

  const mappedNote = STAFF_NOTES_BG[key] ?? STAFF_NOTES_BG[normalizedType] ?? "";

  if (!originalNote) {
    return mappedNote || billingNotice || undefined;
  }

  if (looksSystemGenerated(originalNote)) {
    return [mappedNote, billingNotice].filter(Boolean).join(" ") || undefined;
  }

  if (billingNotice && !originalNote.includes(billingNotice)) {
    return `${originalNote}\n\n${billingNotice}`;
  }

  return originalNote;
}

export function getOperationalRequestDebugKey(input: OperationalCopyInput): string {
  const metadata = input.metadata ?? {};
  const normalizedType = normalizeStaffRequestType(
    String(input.requestType || metadata.rawType || ""),
    metadata.department
  );
  return detectSpecificKey(normalizedType, input);
}
