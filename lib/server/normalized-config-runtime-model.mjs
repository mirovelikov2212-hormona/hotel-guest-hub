import { buildHotelConfigProjection } from "./config-projection-model.mjs";

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function optionalText(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeChecksum(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeRoom(row) {
  return {
    room_number: normalizeText(row?.room_number).replace(/\s+/g, ""),
    floor: optionalText(row?.floor),
    building: optionalText(row?.building),
    room_type: optionalText(row?.room_type),
    active: row?.active === true,
  };
}

function sortRooms(rooms) {
  return rooms.sort((left, right) =>
    left.room_number.localeCompare(right.room_number, undefined, {
      numeric: true,
    }),
  );
}

function activeProjectionRooms(projection) {
  return sortRooms(
    projection.rooms.filter((room) => room.active).map((room) => ({ ...room })),
  );
}

function normalizedActiveRooms(rows) {
  return sortRooms(
    (Array.isArray(rows?.rooms) ? rows.rooms : [])
      .map(normalizeRoom)
      .filter((room) => room.active),
  );
}

function fallback(config, reason) {
  return {
    ok: false,
    source: "published_snapshot",
    reason,
    config,
  };
}

function stateCount(state, key) {
  const value = Number(state?.[key]);
  return Number.isInteger(value) && value >= 0 ? value : -1;
}

function hasMatchingRoomCounts(state, counts) {
  return (
    stateCount(state, "rooms_count") === counts.rooms &&
    stateCount(state, "active_rooms_count") === counts.activeRooms
  );
}

function mergeNormalizedRoomAuthority(config, rooms) {
  const hotelRooms = rooms.map((room) => ({
    roomNumber: room.room_number,
    ...(room.floor ? { floor: room.floor } : {}),
    ...(room.building ? { building: room.building } : {}),
    ...(room.room_type ? { roomType: room.room_type } : {}),
    active: true,
  }));

  return {
    ...config,
    hotelRooms,
    validRoomNumbers: hotelRooms.map((room) => room.roomNumber),
  };
}

export function buildSandboxNormalizedRoomRuntimeConfig(input) {
  const publishedConfig = isObject(input?.publishedConfig)
    ? input.publishedConfig
    : {};

  if (input?.isSandbox !== true) {
    return fallback(publishedConfig, "HOTEL_NOT_SANDBOX");
  }

  const state = isObject(input?.projectionState)
    ? input.projectionState
    : null;
  if (!state) return fallback(publishedConfig, "PROJECTION_STATE_MISSING");

  if (state.projection_status !== "ready") {
    return fallback(publishedConfig, "PROJECTION_NOT_READY");
  }

  const metadata = isObject(state.metadata_json) ? state.metadata_json : {};
  if (metadata.runtimeRoomReadsActivated !== true) {
    return fallback(publishedConfig, "RUNTIME_ROOM_READS_NOT_ACTIVATED");
  }

  if (
    normalizeText(state.projected_revision_id) !==
    normalizeText(input?.publishedRevisionId)
  ) {
    return fallback(publishedConfig, "PROJECTED_REVISION_MISMATCH");
  }

  if (
    normalizeChecksum(state.projected_source_checksum) !==
    normalizeChecksum(input?.publishedChecksum)
  ) {
    return fallback(publishedConfig, "PROJECTED_CHECKSUM_MISMATCH");
  }

  if (state.last_error_code || state.last_error_message) {
    return fallback(publishedConfig, "PROJECTION_HAS_ERROR");
  }

  const expected = buildHotelConfigProjection(publishedConfig);
  if (!expected.ok || !expected.projection || !expected.counts) {
    return fallback(publishedConfig, "PUBLISHED_PROJECTION_INVALID");
  }

  if (!hasMatchingRoomCounts(state, expected.counts)) {
    return fallback(publishedConfig, "PROJECTION_STATE_COUNT_MISMATCH");
  }

  const expectedActiveRooms = activeProjectionRooms(expected.projection);
  const normalizedRooms = normalizedActiveRooms(input?.rows);

  if (JSON.stringify(expectedActiveRooms) !== JSON.stringify(normalizedRooms)) {
    return fallback(publishedConfig, "NORMALIZED_ROOM_PARITY_MISMATCH");
  }

  return {
    ok: true,
    source: "normalized",
    reason: null,
    config: mergeNormalizedRoomAuthority(publishedConfig, normalizedRooms),
  };
}
