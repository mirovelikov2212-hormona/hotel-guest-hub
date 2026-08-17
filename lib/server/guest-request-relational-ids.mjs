const RELATIONAL_AUTHORITY = Symbol.for(
  "stayhub.guest-request-relational-ids-authority",
);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function normalizeRoomNumber(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function normalizeChecksum(value) {
  return normalizeText(value).toLowerCase();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalizeText(value),
  );
}

function normalizeIdMap(value, normalizeMapKey) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const entries = Object.entries(value);
  const result = {};
  for (const [rawKey, rawId] of entries) {
    const key = normalizeMapKey(rawKey);
    const id = normalizeText(rawId);
    if (!key || !isUuid(id) || result[key]) return null;
    result[key] = id;
  }

  return result;
}

function normalizeAuthority(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const revisionId = normalizeText(value.revisionId);
  const sourceChecksum = normalizeChecksum(value.sourceChecksum);
  const roomIdByNumber = normalizeIdMap(
    value.roomIdByNumber,
    normalizeRoomNumber,
  );
  const departmentIdByCode = normalizeIdMap(
    value.departmentIdByCode,
    normalizeKey,
  );
  const routingDepartmentIdByRequestType = normalizeIdMap(
    value.routingDepartmentIdByRequestType,
    normalizeKey,
  );

  if (
    !isUuid(revisionId) ||
    !/^[a-f0-9]{64}$/.test(sourceChecksum) ||
    !roomIdByNumber ||
    !departmentIdByCode ||
    !routingDepartmentIdByRequestType
  ) {
    return null;
  }

  return {
    revisionId,
    sourceChecksum,
    roomIdByNumber,
    departmentIdByCode,
    routingDepartmentIdByRequestType,
  };
}

export function attachGuestRequestRelationalAuthority(config, authority) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;

  const normalized = normalizeAuthority(authority);
  if (!normalized) return config;

  Object.defineProperty(config, RELATIONAL_AUTHORITY, {
    value: Object.freeze(normalized),
    configurable: false,
    // Enumerable symbols survive internal object spreads but remain absent from
    // JSON serialization and Object.keys(), so relational UUIDs stay server-only.
    enumerable: true,
    writable: false,
  });

  return config;
}

export function getGuestRequestRelationalAuthority(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  return normalizeAuthority(config[RELATIONAL_AUTHORITY]);
}

export function resolveGuestRequestRelationalIds(config, input) {
  const authority = getGuestRequestRelationalAuthority(config);
  if (!authority) {
    return {
      active: false,
      ok: true,
      roomId: null,
      departmentId: null,
      revisionId: null,
      sourceChecksum: null,
    };
  }

  const roomNumber = normalizeRoomNumber(input?.roomNumber);
  const departmentCode = normalizeKey(input?.departmentCode);
  const requestType = normalizeKey(input?.requestType);
  const roomId = authority.roomIdByNumber[roomNumber] || null;
  const departmentId = authority.departmentIdByCode[departmentCode] || null;
  const routedDepartmentId =
    authority.routingDepartmentIdByRequestType[requestType] || null;

  if (!roomId) {
    return {
      active: true,
      ok: false,
      code: "NORMALIZED_ROOM_ID_MISSING",
    };
  }

  if (!departmentId) {
    return {
      active: true,
      ok: false,
      code: "NORMALIZED_DEPARTMENT_ID_MISSING",
    };
  }

  if (!routedDepartmentId || routedDepartmentId !== departmentId) {
    return {
      active: true,
      ok: false,
      code: "NORMALIZED_ROUTING_DEPARTMENT_ID_MISMATCH",
    };
  }

  return {
    active: true,
    ok: true,
    roomId,
    departmentId,
    revisionId: authority.revisionId,
    sourceChecksum: authority.sourceChecksum,
  };
}
