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
  staffTitleBg?: string | null;
  staffNoteBg?: string | null;
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

function cleanText(value: unknown) {
  return String(value ?? "").trim();
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
    metadata.staffTitleBg,
    metadata.staffNoteBg,
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

  if (/pillow_menu|menu_vazglav|меню_възглавници|perne|polstar|polstare|vazglav/.test(signals)) {
    return "pillow_menu";
  }

  if (/special_occasion|occasion|ocazie|prilezitost|повод|birthday|anniversary|narozen/.test(signals)) {
    return "special_occasion";
  }

  if (/coffee_machine|kafe_mashina|кафе_машина|kavovar|aparat_de_cafea/.test(signals)) {
    return "coffee_machine";
  }

  if (/minibar_not_cooling|minibar.*cool|minibar.*race|minibar.*chlad|minibar.*охлажда|охлажда|не_охлажда/.test(signals)) {
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
    normalized.includes("selected_wake") ||
    normalized.includes("wake_up") ||
    normalized.includes("ora_de_trezire") ||
    normalized.includes("vybrany_cas_buzeni") ||
    normalized.includes("gewaehlte_weckzeit") ||
    normalized.includes("late_checkout") ||
    normalized.includes("pozdni_check") ||
    normalized.includes("serviciu_contra_cost") ||
    normalized.includes("placena_sluzba") ||
    normalized.includes("kostenpflichtiger_service") ||
    normalized.includes("paid_service") ||
    normalized.includes("услугата") ||
    normalized.includes("платена_услуга") ||
    normalized.includes("charged_to_the_room") ||
    normalized.includes("room_account") ||
    normalized.includes("сметката_на_стаята")
  );
}

function hasBulgarianLetters(value: string) {
  return /[А-Яа-я]/.test(value);
}

function extractTime(value: string) {
  const match = value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
}

function extractDateLike(value: string) {
  const match = value.match(/\b(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\b/);
  return match?.[1] ?? "";
}

function extractPeopleCount(value: string) {
  const match = value.match(/(?:for|pentru|pro|für|за)\s+(\d+)\s+(?:people|persoane|osob|personen|човека?)/i);
  return match?.[1] ?? "";
}

function formatBillingNotice(metadata: RequestMetadata) {
  if (!metadata.requiresBilling) return "";

  const price = cleanText(metadata.price);
  const currency = cleanText(metadata.currency);
  const amount = [price, currency].filter(Boolean).join(" ");

  return amount
    ? `Платена услуга. Цена: ${amount}. Рецепцията трябва да начисли услугата към сметката на стаята.`
    : "Платена услуга. Рецепцията трябва да начисли услугата към сметката на стаята.";
}

function translateGeneratedNoteToBg(key: string, originalNote: string, metadata: RequestMetadata) {
  const note = cleanText(originalNote);
  const time = extractTime(note);
  const date = extractDateLike(note);
  const people = extractPeopleCount(note);
  const billingNotice = formatBillingNotice(metadata);

  switch (key) {
    case "wake_up_call":
      return time ? `Избран час за събуждане: ${time}` : "Гостът заяви събуждане.";

    case "late_checkout": {
      const base = time ? `Желан късен check-out: ${time}.` : "Гостът иска късен check-out.";
      return `${base} Късният check-out е платена услуга. Финалните условия и цена се потвърждават от рецепцията.`;
    }

    case "taxi":
      return time ? `Гостът иска такси за: ${time}` : "Гостът иска такси.";

    case "restaurant_reservation": {
      const parts = [
        people ? `Хора: ${people}` : "",
        date ? `Дата: ${date}` : "",
        time ? `Час: ${time}` : "",
      ].filter(Boolean);
      return parts.length > 0 ? `Резервация: ${parts.join(" · ")}` : "Гостът иска резервация.";
    }

    case "coffee_capsules":
    case "pillow_menu":
    case "minibar":
    case "minibar_refill":
    case "laundry":
      return [STAFF_NOTES_BG[key], billingNotice].filter(Boolean).join(" ") || undefined;

    case "coffee_machine":
    case "minibar_not_cooling":
      return STAFF_NOTES_BG[key];

    case "other_technical_issue":
      return note && !looksSystemGenerated(note)
        ? `Описание от госта: ${note}`
        : "Гостът съобщи за повреда. Вижте детайлите при проверка на стаята.";

    case "special_occasion":
      return note && !looksSystemGenerated(note)
        ? `Описание от госта: ${note}`
        : "Гостът изпрати заявка за специален повод.";

    default:
      break;
  }

  if (billingNotice) return billingNotice;
  return undefined;
}

export function getOperationalRequestTitleBg(input: OperationalCopyInput): string {
  const metadata = input.metadata ?? {};
  const normalizedType = normalizeStaffRequestType(
    String(input.requestType || metadata.rawType || ""),
    metadata.department
  );
  const key = detectSpecificKey(normalizedType, input);
  const storedTitle = cleanText(metadata.staffTitleBg);

  if (storedTitle && hasBulgarianLetters(storedTitle)) return storedTitle;

  return STAFF_TITLES_BG[key] ?? STAFF_TITLES_BG[normalizedType] ?? "Заявка";
}

export function getOperationalRequestNoteBg(input: OperationalCopyInput): string | undefined {
  const metadata = input.metadata ?? {};
  const normalizedType = normalizeStaffRequestType(
    String(input.requestType || metadata.rawType || ""),
    metadata.department
  );
  const key = detectSpecificKey(normalizedType, input);

  const originalNote = cleanText(metadata.note ?? input.message ?? "");
  const storedNote = cleanText(metadata.staffNoteBg);
  const billingNotice = formatBillingNotice(metadata);
  const mappedNote = STAFF_NOTES_BG[key] ?? STAFF_NOTES_BG[normalizedType] ?? "";
  const translatedGeneratedNote = translateGeneratedNoteToBg(key, originalNote || storedNote, metadata);

  // If the saved staff note is already Bulgarian and not just a copied foreign system phrase, use it.
  if (storedNote && hasBulgarianLetters(storedNote) && !looksSystemGenerated(storedNote)) {
    if (billingNotice && !storedNote.includes(billingNotice)) {
      return `${storedNote}\n\n${billingNotice}`;
    }
    return storedNote;
  }

  // Generated UI phrases from EN/DE/RO/CS are normalized to Bulgarian here.
  if (translatedGeneratedNote) return translatedGeneratedNote;

  if (!originalNote) {
    return mappedNote || billingNotice || undefined;
  }

  if (looksSystemGenerated(originalNote)) {
    return [mappedNote, billingNotice].filter(Boolean).join(" ") || undefined;
  }

  if (billingNotice) {
    return `Описание от госта: ${originalNote}\n\n${billingNotice}`;
  }

  // Free text cannot be safely translated without an AI step, but the staff still gets a Bulgarian label.
  return `Описание от госта: ${originalNote}`;
}

export function getOperationalRequestDebugKey(input: OperationalCopyInput): string {
  const metadata = input.metadata ?? {};
  const normalizedType = normalizeStaffRequestType(
    String(input.requestType || metadata.rawType || ""),
    metadata.department
  );
  return detectSpecificKey(normalizedType, input);
}
