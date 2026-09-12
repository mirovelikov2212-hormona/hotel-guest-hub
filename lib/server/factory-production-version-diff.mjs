import { createHash } from "node:crypto";

const CATEGORY_ORDER = Object.freeze([
  "content",
  "services",
  "routing",
  "hours",
  "policies",
  "venues",
  "design",
  "operational_settings",
]);

const COLLECTION_IDENTITY_FIELDS = Object.freeze({
  hotelRooms: ["roomNumber"],
  requestDefs: ["id", "requestType"],
  venueRows: ["id", "code", "slug", "name"],
  hotelInfoItems: ["id", "key", "slug", "code", "title"],
  taxiProviders: ["id", "code", "name"],
  housekeepingExtras: ["id", "code", "key", "name"],
});

const DESIGN_KEYS = new Set(["theme", "coverImage", "coverImagePosition"]);
const CONTENT_KEYS = new Set([
  "hotelName",
  "i18n",
  "languages",
  "languageDefault",
  "wifi",
  "socialLinks",
  "reviews",
]);
const SERVICE_KEYS = new Set([
  "requestDefs",
  "housekeepingExtras",
  "wakeUpSlots",
  "taxiProviders",
]);
const POLICY_KEYS = new Set(["hotelInfoItems", "lateCheckoutInfo", "minibarNotice"]);
const VENUE_KEYS = new Set(["venueRows"]);
const HOURS_KEYS = new Set(["departmentHours"]);
const ROUTING_FIELDS = new Set([
  "targetDepartment",
  "requestType",
  "afterHoursDepartment",
  "department",
  "dept",
  "routing",
  "route",
  "priority",
  "autoAssignMode",
]);

const MAX_CHANGE_PATHS = 250;

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "null" : serialized;
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

function sha256(value) {
  const input = typeof value === "string" ? value : canonicalize(value);
  return createHash("sha256").update(input).digest("hex");
}

function primitiveEqual(left, right) {
  return Object.is(left, right);
}

function topLevelKey(path) {
  const match = String(path || "").match(/^([^.\[]+)/);
  return match?.[1] || "unknown";
}

function classifyPath(path) {
  const top = topLevelKey(path);
  if (DESIGN_KEYS.has(top)) return "design";
  if (VENUE_KEYS.has(top)) return "venues";
  if (HOURS_KEYS.has(top)) return "hours";
  if (POLICY_KEYS.has(top)) return "policies";
  if (top === "requestDefs") {
    const segments = String(path).split(/[.\[\]]+/).filter(Boolean);
    if (segments.some((segment) => ROUTING_FIELDS.has(segment))) return "routing";
    return "services";
  }
  if (SERVICE_KEYS.has(top)) return "services";
  if (CONTENT_KEYS.has(top)) return "content";
  return "operational_settings";
}

function identityForCollectionItem(topKey, item) {
  if (!isRecord(item)) return null;
  const fields = COLLECTION_IDENTITY_FIELDS[topKey];
  if (!fields) return null;
  for (const field of fields) {
    const value = item[field];
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (normalized) return `${field}:${normalized}`;
  }
  return null;
}

function buildIdentityMap(topKey, items) {
  const map = new Map();
  for (const item of items) {
    const identity = identityForCollectionItem(topKey, item);
    if (!identity || map.has(identity)) return null;
    map.set(identity, item);
  }
  return map;
}

function collectionSemanticallyEqual(left, right) {
  if (left.length !== right.length) return false;
  const leftEntries = left.map((entry) => canonicalize(entry)).sort();
  const rightEntries = right.map((entry) => canonicalize(entry)).sort();
  return leftEntries.every((entry, index) => entry === rightEntries[index]);
}

function appendChange(changes, path, kind) {
  changes.push({
    path: path || "$",
    kind,
    category: classifyPath(path),
  });
}

function diffArrays(left, right, path, changes) {
  const top = topLevelKey(path);
  const leftMap = buildIdentityMap(top, left);
  const rightMap = buildIdentityMap(top, right);

  if (!leftMap || !rightMap) {
    if (!collectionSemanticallyEqual(left, right)) appendChange(changes, path, "collection_changed");
    return;
  }

  const identities = Array.from(new Set([...leftMap.keys(), ...rightMap.keys()])).sort();
  for (const identity of identities) {
    const token = sha256(identity).slice(0, 12);
    const itemPath = `${path}[#${token}]`;
    const hasLeft = leftMap.has(identity);
    const hasRight = rightMap.has(identity);
    if (!hasLeft) {
      appendChange(changes, itemPath, "added");
      continue;
    }
    if (!hasRight) {
      appendChange(changes, itemPath, "removed");
      continue;
    }
    diffValues(leftMap.get(identity), rightMap.get(identity), itemPath, changes);
  }
}

function diffObjects(left, right, path, changes) {
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
  for (const key of keys) {
    const childPath = path ? `${path}.${key}` : key;
    const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
    const hasRight = Object.prototype.hasOwnProperty.call(right, key);
    if (!hasLeft) {
      appendChange(changes, childPath, "added");
      continue;
    }
    if (!hasRight) {
      appendChange(changes, childPath, "removed");
      continue;
    }
    diffValues(left[key], right[key], childPath, changes);
  }
}

function diffValues(left, right, path, changes) {
  if (primitiveEqual(left, right)) return;
  if (Array.isArray(left) && Array.isArray(right)) {
    diffArrays(left, right, path, changes);
    return;
  }
  if (isRecord(left) && isRecord(right)) {
    diffObjects(left, right, path, changes);
    return;
  }
  appendChange(changes, path, "changed");
}

function summarizeChanges(changes) {
  const categoryCounts = Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 0]));
  const topLevelKeys = new Set();
  for (const change of changes) {
    categoryCounts[change.category] += 1;
    topLevelKeys.add(topLevelKey(change.path));
  }
  return {
    categoryCounts,
    changedCategories: CATEGORY_ORDER.filter((category) => categoryCounts[category] > 0),
    topLevelKeys: Array.from(topLevelKeys).sort(),
  };
}

export function buildHotelConfigVersionDiff(currentConfig, candidateConfig) {
  if (!isRecord(currentConfig) || !isRecord(candidateConfig)) {
    throw new TypeError("CM2_CONFIG_OBJECT_REQUIRED");
  }

  const allChanges = [];
  diffObjects(currentConfig, candidateConfig, "", allChanges);
  allChanges.sort((left, right) =>
    left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind) || left.category.localeCompare(right.category),
  );

  const summary = summarizeChanges(allChanges);
  const auditChanges = allChanges.slice(0, MAX_CHANGE_PATHS);
  const evidence = {
    schemaVersion: "cm2-version-diff-v1",
    totalChanges: allChanges.length,
    categoryCounts: summary.categoryCounts,
    changedCategories: summary.changedCategories,
    topLevelKeys: summary.topLevelKeys,
    changes: auditChanges,
    truncated: allChanges.length > auditChanges.length,
  };

  return {
    ...evidence,
    changed: allChanges.length > 0,
    diffHash: sha256(evidence),
  };
}

export const HOTEL_CONFIG_CHANGE_CATEGORIES = CATEGORY_ORDER;
