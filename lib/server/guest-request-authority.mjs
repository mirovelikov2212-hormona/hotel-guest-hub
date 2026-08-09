const VALID_DEPARTMENTS = new Set([
  "housekeeping",
  "maintenance",
  "reception",
  "restaurant",
]);

const BILLABLE_REQUEST_KEYS = new Set([
  "coffee_capsules",
  "pillow_menu",
  "minibar",
  "minibar_refill",
  "laundry",
  "late_checkout",
  "massage_booking",
]);

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function normalizeOptionalText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function uniqueLowercaseList(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function isUsableRequestDef(def) {
  return Boolean(
    def &&
      typeof def === "object" &&
      normalizeKey(def.type || "request") === "request" &&
      def.enabled !== false &&
      def.guestVisible !== false,
  );
}

function findRequestDef(requestDefs, rawType, sourceRequestDef) {
  const defs = (Array.isArray(requestDefs) ? requestDefs : []).filter(isUsableRequestDef);
  const sourceKey = normalizeKey(sourceRequestDef);
  const rawKey = normalizeKey(rawType);

  if (sourceKey) {
    const byId = defs.find((def) => normalizeKey(def.id) === sourceKey);
    if (byId) return { def: byId, matchedBy: "source" };

    const byCanonicalRef = defs.find(
      (def) => normalizeKey(def.canonicalRef) === sourceKey,
    );
    if (byCanonicalRef) return { def: byCanonicalRef, matchedBy: "source" };

    return { def: null, matchedBy: "source_missing" };
  }

  if (!rawKey) return { def: null, matchedBy: "none" };

  const byId = defs.find((def) => normalizeKey(def.id) === rawKey);
  if (byId) return { def: byId, matchedBy: "raw_id" };

  const byRequestType = defs.find(
    (def) => normalizeKey(def.requestType) === rawKey,
  );
  if (byRequestType) return { def: byRequestType, matchedBy: "raw_type" };

  return { def: null, matchedBy: "none" };
}

function parseMoney(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/\d+(?:[,.]\d{1,2})?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value) {
  return Number(value).toFixed(2).replace(".", ",");
}

function parseQuantityFromNote(note) {
  const text = String(note ?? "");
  if (!text.trim()) return null;

  const patterns = [
    /(?:Количество|Quantity|Anzahl|Cantitate|Množství|Počet)\s*:\s*(\d{1,3})/i,
    /(?:бр\.?|pcs?|Stk\.?|buc\.?|ks|шт\.?)\s*[:=-]?\s*(\d{1,3})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > 0) return value;
  }

  return null;
}

function derivePrice(def, note, requiresBilling) {
  const configuredPrice = normalizeOptionalText(def?.price);
  if (!configuredPrice) return { price: null, quantity: null };

  const unitPrice = parseMoney(configuredPrice);
  const isQuantityRequest =
    def?.requiresQuantity === true || normalizeKey(def?.requestKind) === "quantity";

  if (!isQuantityRequest) {
    return { price: configuredPrice, quantity: null };
  }

  const quantity = parseQuantityFromNote(note);
  const minQty = Number.isFinite(Number(def?.minQty)) ? Number(def.minQty) : 1;
  const maxQty = Number.isFinite(Number(def?.maxQty)) ? Number(def.maxQty) : 20;

  if (!quantity || quantity < minQty || quantity > maxQty) {
    if (requiresBilling && unitPrice !== null) {
      return {
        error: {
          code: "REQUEST_QUANTITY_INVALID",
          message: "The configured paid quantity could not be validated.",
        },
      };
    }

    return { price: configuredPrice, quantity: null };
  }

  if (unitPrice === null) {
    return { price: configuredPrice, quantity };
  }

  return {
    price: formatMoney(unitPrice * quantity),
    quantity,
  };
}

export function resolveGuestRequestAuthority(input) {
  const rawType = normalizeKey(input?.rawType);
  const requestedSourceRequestDef = normalizeKey(input?.sourceRequestDef);
  const lookup = findRequestDef(
    input?.requestDefs,
    rawType,
    requestedSourceRequestDef,
  );

  if (lookup.matchedBy === "source_missing") {
    return {
      ok: false,
      code: "REQUEST_DEF_NOT_FOUND",
      message: "The requested hotel service is not available in the current configuration.",
    };
  }

  const def = lookup.def;
  const authoritativeRequestType = normalizeKey(def?.requestType || def?.id || rawType);

  if (def && requestedSourceRequestDef && rawType && authoritativeRequestType !== rawType) {
    return {
      ok: false,
      code: "REQUEST_TYPE_MISMATCH",
      message: "The requested service type does not match the hotel configuration.",
    };
  }

  const configuredDepartment = normalizeKey(def?.targetDepartment);
  const department = VALID_DEPARTMENTS.has(configuredDepartment)
    ? configuredDepartment
    : null;

  const billingKeys = new Set(
    [
      rawType,
      authoritativeRequestType,
      normalizeKey(def?.id),
      normalizeKey(def?.requestType),
    ].filter(Boolean),
  );

  const requiresBilling = Boolean(
    def?.requiresBilling === true ||
      normalizeOptionalText(def?.price) ||
      Array.from(billingKeys).some((key) => BILLABLE_REQUEST_KEYS.has(key)),
  );

  const priceResult = derivePrice(def, input?.note, requiresBilling);
  if (priceResult?.error) {
    return {
      ok: false,
      code: priceResult.error.code,
      message: priceResult.error.message,
    };
  }

  const notifyDepartments = uniqueLowercaseList(def?.notifyDepartments);
  if (requiresBilling && !notifyDepartments.includes("reception")) {
    notifyDepartments.push("reception");
  }

  return {
    ok: true,
    requestType: authoritativeRequestType || rawType,
    department,
    notifyDepartments,
    requiresBilling,
    price: priceResult?.price ?? null,
    currency: normalizeOptionalText(def?.currency),
    sourceRequestDef: def ? normalizeOptionalText(def.id) : null,
    quantity: priceResult?.quantity ?? null,
  };
}
