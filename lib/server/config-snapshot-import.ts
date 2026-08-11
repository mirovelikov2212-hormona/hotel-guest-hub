import "server-only";

import { createHash } from "node:crypto";
import { getHotelConfig } from "@/lib/config";
import { getHotelSheetSources } from "@/lib/hotels/getHotelSheetSources";
import type { HotelConfig } from "@/lib/types";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type JsonObject = Record<string, unknown>;

type ImportOptions = {
  hotelSlug: string;
  dryRun?: boolean;
  actor?: string | null;
};

const RUNTIME_ONLY_CONFIG_KEYS = new Set([
  "hotelId",
  "hotelSlug",
  "publicSlug",
  "isSandbox",
  "productionHotelId",
  "testRoomNumbers",
]);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }

  return value;
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function snapshotConfig(runtimeConfig: HotelConfig): JsonObject {
  const snapshot = Object.fromEntries(
    Object.entries(runtimeConfig)
      .filter(([key, value]) => !RUNTIME_ONLY_CONFIG_KEYS.has(key) && value !== undefined)
      .map(([key, value]) => [key, canonicalize(value)]),
  );

  return snapshot;
}

function sourceForTopLevelKey(key: string) {
  if (key === "i18n") return "i18n_csv";
  if (key === "venueRows") return "venues_csv";
  if (key === "requestDefs") return "request_defs_csv";
  if (key === "hotelInfoItems") return "hotel_info_csv_resolved_by_config";
  if (key === "hotelRooms" || key === "validRoomNumbers") {
    return "rooms_csv_resolved_by_config";
  }

  return "merged_hotel_setup_and_config_csv";
}

function buildProvenance(config: JsonObject) {
  return Object.fromEntries(
    Object.keys(config)
      .sort()
      .map((key) => [
        key,
        {
          source: sourceForTopLevelKey(key),
          precedence:
            sourceForTopLevelKey(key) === "merged_hotel_setup_and_config_csv"
              ? ["hotel_setup_csv", "config_csv"]
              : undefined,
        },
      ]),
  );
}

function isValidTimezone(value: unknown) {
  const timezone = String(value ?? "").trim();
  if (!timezone) return false;

  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function validateSnapshot(config: JsonObject) {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hotelName = String(config.hotelName ?? "").trim();
  if (!hotelName) errors.push("HOTEL_NAME_REQUIRED");

  const languages = Array.isArray(config.languages)
    ? config.languages.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean)
    : [];

  if (!languages.length) errors.push("LANGUAGES_REQUIRED");
  if (new Set(languages).size !== languages.length) {
    errors.push("LANGUAGES_DUPLICATED");
  }

  const languageDefault = String(config.languageDefault ?? "").trim().toLowerCase();
  if (!languageDefault || !languages.includes(languageDefault)) {
    errors.push("DEFAULT_LANGUAGE_NOT_ENABLED");
  }

  const opsLanguage = String(config.opsLanguage ?? "").trim().toLowerCase();
  if (!opsLanguage || !languages.includes(opsLanguage)) {
    errors.push("OPS_LANGUAGE_NOT_ENABLED");
  }

  if (!isValidTimezone(config.hotelTimezone)) {
    errors.push("HOTEL_TIMEZONE_INVALID");
  }

  const rooms = Array.isArray(config.hotelRooms) ? config.hotelRooms : [];
  const roomNumbers = rooms
    .map((room) =>
      room && typeof room === "object"
        ? String((room as JsonObject).roomNumber ?? "").trim()
        : "",
    )
    .filter(Boolean);

  if (!roomNumbers.length) errors.push("ACTIVE_ROOMS_REQUIRED");
  if (new Set(roomNumbers).size !== roomNumbers.length) {
    errors.push("ROOM_NUMBER_DUPLICATED");
  }

  const requestDefs = Array.isArray(config.requestDefs) ? config.requestDefs : [];
  const requestIds = requestDefs
    .map((definition) =>
      definition && typeof definition === "object"
        ? String((definition as JsonObject).id ?? "").trim()
        : "",
    )
    .filter(Boolean);

  if (requestIds.length !== requestDefs.length) {
    errors.push("REQUEST_ID_REQUIRED");
  }

  if (new Set(requestIds).size !== requestIds.length) {
    errors.push("REQUEST_ID_DUPLICATED");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function buildSourceMetadata(input: {
  requestedHotelSlug: string;
  hotelId: string;
  publicSlug?: string | null;
  isSandbox?: boolean | null;
  productionHotelId?: string | null;
  configUrl?: string | null;
  venuesUrl?: string | null;
  i18nUrl?: string | null;
  hotelSetupUrl?: string | null;
  requestDefsUrl?: string | null;
}) {
  return {
    importedAt: new Date().toISOString(),
    requestedHotelSlug: input.requestedHotelSlug,
    resolvedHotelId: input.hotelId,
    resolvedPublicSlug: input.publicSlug ?? null,
    isSandbox: Boolean(input.isSandbox),
    productionHotelId: input.productionHotelId ?? null,
    sources: {
      configCsvUrl: input.configUrl ?? null,
      venuesCsvUrl: input.venuesUrl ?? null,
      i18nCsvUrl: input.i18nUrl ?? null,
      hotelSetupCsvUrl: input.hotelSetupUrl ?? null,
      requestDefsCsvUrl: input.requestDefsUrl ?? null,
    },
    excludedRuntimeFields: Array.from(RUNTIME_ONLY_CONFIG_KEYS).sort(),
  };
}

export async function importHotelConfigSnapshotDraft(options: ImportOptions) {
  const hotelSlug = String(options.hotelSlug || "").trim().toLowerCase();
  if (!hotelSlug) {
    return {
      ok: false,
      status: 400,
      error: "HOTEL_SLUG_REQUIRED",
    };
  }

  const [runtimeConfig, sources] = await Promise.all([
    getHotelConfig(hotelSlug),
    getHotelSheetSources(hotelSlug),
  ]);

  if (!runtimeConfig || !sources?.hotelId) {
    return {
      ok: false,
      status: 404,
      error: "HOTEL_CONFIG_NOT_FOUND",
    };
  }

  const config = snapshotConfig(runtimeConfig);
  const provenance = buildProvenance(config);
  const validation = validateSnapshot(config);
  const sourceMetadata = buildSourceMetadata({
    requestedHotelSlug: hotelSlug,
    ...sources,
  });
  const sourceChecksum = sha256(canonicalJson(config));

  const summary = {
    hotelId: sources.hotelId,
    hotelSlug: sources.hotelSlug,
    publicSlug: sources.publicSlug ?? null,
    isSandbox: Boolean(sources.isSandbox),
    sourceChecksum,
    validation,
    counts: {
      languages: Array.isArray(config.languages) ? config.languages.length : 0,
      rooms: Array.isArray(config.hotelRooms) ? config.hotelRooms.length : 0,
      requestDefs: Array.isArray(config.requestDefs) ? config.requestDefs.length : 0,
      venueRows: Array.isArray(config.venueRows) ? config.venueRows.length : 0,
      hotelInfoItems: Array.isArray(config.hotelInfoItems) ? config.hotelInfoItems.length : 0,
    },
  };

  if (options.dryRun !== false) {
    return {
      ok: validation.ok,
      status: validation.ok ? 200 : 422,
      dryRun: true,
      ...summary,
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
    "create_hotel_config_draft",
    {
      p_hotel_id: sources.hotelId,
      p_source_type: "sheet_snapshot",
      p_source_checksum: sourceChecksum,
      p_config_json: config,
      p_provenance_json: provenance,
      p_source_metadata_json: sourceMetadata,
      p_validation_json: validation,
      p_actor: String(options.actor || "m9_config_import").trim(),
    },
  );

  if (error) {
    console.error("Failed to create hotel configuration draft", {
      hotelId: sources.hotelId,
      hotelSlug: sources.hotelSlug,
      error,
    });

    return {
      ok: false,
      status: 500,
      error: "CONFIG_DRAFT_CREATE_FAILED",
    };
  }

  return {
    ok: validation.ok,
    status: validation.ok ? 200 : 422,
    dryRun: false,
    ...summary,
    revision: data,
  };
}
