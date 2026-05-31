import type {
  LangKey,
  RequestDef,
  RequestDefConfirmationMode,
  RequestDefKind,
  RequestDefTextMap,
  RequestDefTimeMode,
  RequestDefType,
} from "@/lib/types";

const DEFAULT_LANGS = ["bg", "en", "de", "ro", "cs"] as const;

type LooseRow = Record<string, string>;

function readFirst(row: LooseRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function toBool(value: string, fallback = false): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["true", "1", "yes", "y", "on"].includes(raw)) return true;
  if (["false", "0", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

function toNumber(value: string, fallback?: number): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value: string): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  // Prefer pipe-separated lists. Commas are common in prices such as "60,00 €".
  const delimiter = raw.includes("|") ? /\|/ : /,/;

  return raw
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeType(value: string): RequestDefType {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  if (raw === "info" || raw === "policy" || raw === "pdf" || raw === "external_link" || raw === "link") {
    return raw;
  }

  return "request";
}

function normalizeRequestKind(value: string, type: RequestDefType): RequestDefKind {
  const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (raw === "selection" || raw === "quantity" || raw === "time_slot" || raw === "info_only") {
    return raw;
  }
  return type === "request" ? "standard" : "info_only";
}

function normalizeTimeMode(value: string, kind: RequestDefKind): RequestDefTimeMode {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "free" || raw === "slots" || raw === "none") return raw;
  return kind === "time_slot" ? "slots" : "none";
}

function normalizeConfirmationMode(value: string, type: RequestDefType): RequestDefConfirmationMode {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "instant" || raw === "staff_required" || raw === "policy_only") return raw;
  return type === "request" ? "instant" : "policy_only";
}

function buildTextMap(
  row: LooseRow,
  base: string,
  langs: LangKey[],
  fallbackKeys: string[] = []
): RequestDefTextMap {
  const out: RequestDefTextMap = {};
  const langList = Array.from(new Set([...DEFAULT_LANGS, ...langs.map((lang) => String(lang).trim()).filter(Boolean)]));

  for (const lang of langList) {
    const baseTitle = base
      .replace(/_/g, " ")
      .replace(/\w/g, (char) => char.toUpperCase());

    const value = readFirst(row, [
      `${base}_${lang}`,
      `${base}_${String(lang).toUpperCase()}`,
      `${base}${String(lang).toUpperCase()}`,
      `${base}${String(lang).charAt(0).toUpperCase()}${String(lang).slice(1)}`,
      `${baseTitle} ${String(lang).toUpperCase()}`,
      `${baseTitle} ${String(lang).toLowerCase()}`,
    ]);

    if (value) out[lang] = value;
  }

  const generic = readFirst(row, [base, ...fallbackKeys]);
  if (generic) {
    for (const lang of langList) {
      out[lang] ||= generic;
    }
  }

  return out;
}

function buildOptionsMap(row: LooseRow, langs: LangKey[]): Partial<Record<LangKey, string[]>> {
  const out: Partial<Record<LangKey, string[]>> = {};
  const langList = Array.from(new Set([...DEFAULT_LANGS, ...langs.map((lang) => String(lang).trim()).filter(Boolean)]));

  for (const lang of langList) {
    const upper = String(lang).toUpperCase();
    const lower = String(lang).toLowerCase();
    const raw = readFirst(row, [
      `options_${lower}`,
      `options_${upper}`,
      `Options ${upper}`,
      `Options ${lower}`,
      `options${upper}`,
      `Options${upper}`,
    ]);

    const parsed = parseList(raw);
    if (parsed.length) out[lang] = parsed;
  }

  return out;
}

function buildOptionInfoMap(row: LooseRow, langs: LangKey[]): Partial<Record<LangKey, string[]>> {
  const out: Partial<Record<LangKey, string[]>> = {};
  const langList = Array.from(new Set([...DEFAULT_LANGS, ...langs.map((lang) => String(lang).trim()).filter(Boolean)]));

  for (const lang of langList) {
    const upper = String(lang).toUpperCase();
    const lower = String(lang).toLowerCase();
    const raw = readFirst(row, [
      `option_info_${lower}`,
      `option_info_${upper}`,
      `option_infos_${lower}`,
      `option_infos_${upper}`,
      `option_description_${lower}`,
      `option_description_${upper}`,
      `option_descriptions_${lower}`,
      `option_descriptions_${upper}`,
      `Option Info ${upper}`,
      `Option Description ${upper}`,
    ]);

    const parsed = parseList(raw);
    if (parsed.length) out[lang] = parsed;
  }

  return out;
}

function normalizeCategory(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

export function getRequestDefText(
  def: Pick<RequestDef, "title" | "subtitle" | "description" | "policy" | "success" | "staffLabel">,
  lang: LangKey,
  field: keyof Pick<RequestDef, "title" | "subtitle" | "description" | "policy" | "success" | "staffLabel">,
  fallbackLangs: LangKey[] = ["bg", "en", "de"]
): string {
  const map = def[field] as RequestDefTextMap | undefined;
  if (!map) return "";

  const current = String(lang || "").trim();
  if (current && map[current]) return String(map[current]).trim();

  for (const fallback of fallbackLangs) {
    const value = map[String(fallback)];
    if (value) return String(value).trim();
  }

  const first = Object.values(map).find((value) => String(value || "").trim());
  return first ? String(first).trim() : "";
}

export function parseRequestDefs(rows: LooseRow[], langs: LangKey[]): RequestDef[] {
  const out: RequestDef[] = [];

  for (const row of rows) {
    const id = readFirst(row, ["id", "ID", "key", "Key"]);
    if (!id) continue;

    const type = normalizeType(readFirst(row, ["type", "Type", "item_type", "itemType", "Item Type", "Content Type", "content_type"]));
    const requestKind = normalizeRequestKind(
      readFirst(row, ["request_kind", "requestKind", "kind", "Kind"]),
      type
    );

    const requestType = readFirst(row, ["request_type", "requestType", "staff_type", "staffType"]) || id;
    const icon = readFirst(row, ["icon", "Icon"]);
    const rawSection = readFirst(row, ["category", "Category", "section", "Section", "group", "Group"]);
    const category = normalizeCategory(rawSection);
    const subsection = normalizeCategory(readFirst(row, ["subsection", "Subsection", "Subsection Key", "subsection_key"]));
    const targetDepartment = readFirst(row, ["target_department", "targetDepartment", "department", "Department"]) || "none";

    out.push({
      id,
      type,
      category,
      enabled: toBool(readFirst(row, ["enabled", "Enabled", "active", "Active"]), true),
      sortOrder: toNumber(readFirst(row, ["sort_order", "sortOrder", "Sort Order", "order", "Order"]), 999) ?? 999,
      icon: icon || undefined,
      requestKind,
      targetDepartment,
      requestType,
      requiresNote: toBool(readFirst(row, ["requires_note", "requiresNote", "note_required", "noteRequired"])),
      requiresQuantity: toBool(readFirst(row, ["requires_quantity", "requiresQuantity", "quantity_required", "quantityRequired"])),
      minQty: toNumber(readFirst(row, ["min_qty", "minQty", "min", "Min"])),
      maxQty: toNumber(readFirst(row, ["max_qty", "maxQty", "max", "Max"])),
      requiresTime: toBool(readFirst(row, ["requires_time", "requiresTime", "time_required", "timeRequired"])),
      timeMode: normalizeTimeMode(readFirst(row, ["time_mode", "timeMode", "slots_mode", "slotsMode"]), requestKind),
      options: parseList(readFirst(row, ["options_raw", "optionsRaw", "options", "Options", "slots", "Slots"])),
      optionsByLang: buildOptionsMap(row, langs),
      optionImageUrls: parseList(readFirst(row, [
        "option_image_urls",
        "optionImageUrls",
        "option_images",
        "optionImages",
        "image_urls",
        "imageUrls",
        "Option Image URLs",
        "Option Images",
      ])),
      optionInfoByLang: buildOptionInfoMap(row, langs),
      guestVisible: toBool(readFirst(row, ["guest_visible", "guestVisible", "visible", "Visible"]), true),
      staffVisible: toBool(readFirst(row, ["staff_visible", "staffVisible"]), true),
      aiVisible: toBool(readFirst(row, ["ai_visible", "aiVisible"]), true),
      confirmationMode: normalizeConfirmationMode(readFirst(row, ["confirmation_mode", "confirmationMode"]), type),
      title: buildTextMap(row, "title", langs, ["label", "name", "Name"]),
      subtitle: buildTextMap(row, "subtitle", langs),
      description: buildTextMap(row, "description", langs, ["body", "Body", "details", "text", "Text"]),
      policy: buildTextMap(row, "policy", langs, ["notice", "info"]),
      success: buildTextMap(row, "success", langs),
      staffLabel: buildTextMap(row, "staff_label", langs, ["type_label", "typeLabel"]),
      section: category,
      subsection: subsection || undefined,
      sectionTitle: buildTextMap(row, "section_title", langs, ["Section Title", "sectionTitle"]),
      pdfUrl: readFirst(row, ["pdf_url", "pdfUrl", "PDF URL", "Pdf URL"]),
      externalUrl: readFirst(row, ["external_url", "externalUrl", "External URL", "url", "URL"]),
      linkUrl: readFirst(row, ["link_url", "linkUrl", "Link URL"]),
      price: readFirst(row, ["price", "Price"]),
      currency: readFirst(row, ["currency", "Currency"]),
      requiresBilling: toBool(readFirst(row, ["requires_billing", "requiresBilling", "billing", "Billing"])),
      notifyDepartments: parseList(readFirst(row, ["notify_departments", "notifyDepartments", "Notify Departments"])),
      keywords: parseList(readFirst(row, ["keywords", "Keywords"])),
    });
  }

  return out.sort((a, b) => a.sortOrder - b.sortOrder);
}
