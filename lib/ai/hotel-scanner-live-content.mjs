const LIVE_KINDS = new Set(["events", "offers"]);

const MONTHS = Object.freeze({
  january: 1, jan: 1, януари: 1,
  february: 2, feb: 2, февруари: 2,
  march: 3, mar: 3, март: 3,
  april: 4, apr: 4, април: 4,
  may: 5, май: 5,
  june: 6, jun: 6, юни: 6,
  july: 7, jul: 7, юли: 7,
  august: 8, aug: 8, август: 8,
  september: 9, sep: 9, sept: 9, септември: 9,
  october: 10, oct: 10, октомври: 10,
  november: 11, nov: 11, ноември: 11,
  december: 12, dec: 12, декември: 12,
});

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalized(value) {
  return clean(value)
    .toLocaleLowerCase("en-US")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\s.,;:!?()[\]{}"'`]+/g, " ")
    .trim();
}

function keyPart(value) {
  return normalized(value).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function isoDate(year, month, day) {
  const y = Number(year); const m = Number(month); const d = Number(day);
  if (!Number.isInteger(y) || y < 2000 || y > 2200 || !Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(d) || d < 1 || d > 31) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  return `${y}-${pad(m)}-${pad(d)}`;
}

function endOfMonth(year, month) {
  return new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
}

function monthNumber(raw) {
  const token = normalized(raw).replace(/[^\p{L}]/gu, "");
  return MONTHS[token] || 0;
}

function parseNumericRange(source) {
  const match = source.match(/(?:^|\D)(\d{1,2})[./](\d{1,2})[./](20\d{2})\s*(?:-|до|to)\s*(\d{1,2})[./](\d{1,2})[./](20\d{2})(?!\d)/iu);
  if (!match) return null;
  const startsOn = isoDate(match[3], match[2], match[1]);
  const endsOn = isoDate(match[6], match[5], match[4]);
  return startsOn && endsOn ? { startsOn, endsOn, precision: "day" } : null;
}

function parseTextualRange(source) {
  const match = source.match(/(?:^|\b)(?:от\s+|from\s+)?(\d{1,2})\s*(?:-|до|to)\s*(\d{1,2})\s+([\p{L}.]+)\s+(20\d{2})(?:\s*г\.?)?/iu);
  if (!match) return null;
  const month = monthNumber(match[3]);
  if (!month) return null;
  const startsOn = isoDate(match[4], month, match[1]);
  const endsOn = isoDate(match[4], month, match[2]);
  return startsOn && endsOn ? { startsOn, endsOn, precision: "day" } : null;
}

function parseMonthRange(source) {
  const match = source.match(/(?:през\s+|during\s+|in\s+)?([\p{L}.]+)\s+(?:и|and|-)\s+([\p{L}.]+)\s+(20\d{2})/iu);
  if (!match) return null;
  const first = monthNumber(match[1]);
  const second = monthNumber(match[2]);
  if (!first || !second) return null;
  const startsOn = isoDate(match[3], first, 1);
  const endsOn = isoDate(match[3], second, endOfMonth(match[3], second));
  return startsOn && endsOn ? { startsOn, endsOn, precision: "month" } : null;
}

function parseSingleNumericDate(source) {
  const match = source.match(/(?:^|\D)(\d{1,2})[./](\d{1,2})[./](20\d{2})(?!\d)/u);
  if (!match) return null;
  const date = isoDate(match[3], match[2], match[1]);
  return date ? { startsOn: date, endsOn: date, precision: "day" } : null;
}

function parseSingleTextualDate(source) {
  const match = source.match(/(?:^|\b)(\d{1,2})\s+([\p{L}.]+)\s+(20\d{2})(?:\s*г\.?)?/iu);
  if (!match) return null;
  const month = monthNumber(match[2]);
  if (!month) return null;
  const date = isoDate(match[3], month, match[1]);
  return date ? { startsOn: date, endsOn: date, precision: "day" } : null;
}

export function parseHotelLiveContentValidity(value) {
  const source = clean(value).replace(/[\u2010-\u2015]/g, "-");
  if (!source) return { startsOn: "", endsOn: "", precision: "unknown" };
  return parseNumericRange(source)
    || parseTextualRange(source)
    || parseMonthRange(source)
    || parseSingleNumericDate(source)
    || parseSingleTextualDate(source)
    || { startsOn: "", endsOn: "", precision: "unknown" };
}

function scanDay(scannedAt) {
  const parsed = new Date(scannedAt || Date.now());
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

export function hotelLiveContentTemporalState(validity, scannedAt) {
  const today = scanDay(scannedAt);
  if (validity?.endsOn && validity.endsOn < today) return "expired";
  if (validity?.startsOn && validity.startsOn > today) return "scheduled";
  return validity?.startsOn || validity?.endsOn ? "active" : "undated_active";
}

function liveKind(fact) {
  const category = keyPart(fact?.category);
  const attribute = keyPart(fact?.attribute);
  if (category === "events" || ["event_space", "event_capacity", "event_service"].includes(attribute)) return "events";
  if (category === "offers" || attribute === "offer") return "offers";
  return "";
}

function itemTitle(fact) {
  const subject = clean(fact?.subject);
  if (subject && !/^(?:hotel|property|resort)$/iu.test(subject)) return subject;
  return clean(fact?.label) || clean(fact?.value) || "Item";
}

function unique(values) {
  return [...new Set((values || []).map(clean).filter(Boolean))];
}

function fingerprint(facts) {
  return facts
    .map((fact) => `${keyPart(fact?.attribute)}=${normalized(fact?.value)}`)
    .sort()
    .join("|");
}

export function buildHotelScannerBridgeSnapshot(facts = [], scannedAt = new Date().toISOString()) {
  const groups = new Map();
  for (const fact of Array.isArray(facts) ? facts : []) {
    const kind = liveKind(fact);
    if (!LIVE_KINDS.has(kind)) continue;
    const title = itemTitle(fact);
    const key = `${kind}:${keyPart(title)}`;
    if (!keyPart(title)) continue;
    const group = groups.get(key) || { key, kind, title, facts: [] };
    group.facts.push(fact);
    groups.set(key, group);
  }

  const items = [...groups.values()].map((group) => {
    const combined = group.facts.map((fact) => `${clean(fact?.label)} ${clean(fact?.value)}`).join(" | ");
    const validity = parseHotelLiveContentValidity(combined);
    const state = hotelLiveContentTemporalState(validity, scannedAt);
    return {
      key: group.key,
      kind: group.kind,
      title: group.title,
      startsOn: validity.startsOn,
      endsOn: validity.endsOn,
      datePrecision: validity.precision,
      state,
      sourceUrls: unique(group.facts.flatMap((fact) => fact?.verification?.sourceUrls?.length ? fact.verification.sourceUrls : fact?.sourceUrls || [])),
      fingerprint: fingerprint(group.facts),
    };
  }).sort((a, b) => {
    const aDate = a.startsOn || "9999-12-31";
    const bDate = b.startsOn || "9999-12-31";
    return aDate.localeCompare(bDate) || a.title.localeCompare(b.title);
  });

  return {
    schemaVersion: "stayhub-scanner-bridge-v1",
    scannedAt,
    cadence: "daily",
    removalPolicy: "remove_after_successful_section_absence",
    expiryPolicy: "hide_after_explicit_end_date",
    items,
    activeItems: items.filter((item) => item.state !== "expired"),
  };
}

export function diffHotelScannerBridgeSnapshots(previous, current, options = {}) {
  const successfulKinds = new Set(options.successfulKinds || ["events", "offers"]);
  const previousItems = new Map((previous?.items || []).map((item) => [item.key, item]));
  const currentItems = new Map((current?.items || []).map((item) => [item.key, item]));
  const added = []; const updated = []; const removed = []; const expired = [];

  for (const item of currentItems.values()) {
    const before = previousItems.get(item.key);
    if (item.state === "expired" && before?.state !== "expired") expired.push(item);
    if (!before && item.state !== "expired") added.push(item);
    else if (before && (before.fingerprint !== item.fingerprint || before.startsOn !== item.startsOn || before.endsOn !== item.endsOn || before.state !== item.state)) updated.push({ before, after: item });
  }

  for (const item of previousItems.values()) {
    if (!currentItems.has(item.key) && successfulKinds.has(item.kind)) removed.push(item);
  }

  return {
    schemaVersion: "stayhub-scanner-bridge-diff-v1",
    added,
    updated,
    removed,
    expired,
    active: current?.activeItems || [],
  };
}
