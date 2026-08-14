import "server-only";

import { createHash } from "node:crypto";
import {
  isSandboxHotel,
  resolveHotelByAnySlugAdmin,
} from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type JsonObject = Record<string, unknown>;

type CloneSandboxConfigOptions = {
  sandboxHotelSlug: string;
  expectedProductionRevisionId: string;
  actor?: string | null;
};

type CloneSandboxConfigResult = {
  ok?: boolean;
  changed?: boolean;
  deduplicated?: boolean;
  sandbox_hotel_id?: string;
  production_hotel_id?: string;
  production_revision_id?: string;
  revision_id?: string;
  revision_no?: number;
  status?: string;
  source_checksum?: string;
};

type CreateSandboxManualDraftOptions = {
  sandboxHotelSlug: string;
  baseRevisionId: string;
  patch: JsonObject;
  actor?: string | null;
};

type CreateSandboxManualDraftResult = {
  ok?: boolean;
  changed?: boolean;
  deduplicated?: boolean;
  hotel_id?: string;
  revision_id?: string;
  revision_no?: number;
  status?: string;
  source_checksum?: string;
};

type SandboxBaseRevisionRow = {
  id: string;
  hotel_id: string;
  status: string;
  source_checksum: string;
  config_json: JsonObject;
  provenance_json: JsonObject;
  validation_json: JsonObject;
};

const RUNTIME_IDENTITY_KEYS = new Set([
  "hotelId",
  "hotelSlug",
  "publicSlug",
  "isSandbox",
  "productionHotelId",
  "testRoomNumbers",
]);

function requiredText(value: unknown, code: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }

  return value;
}

function sha256Json(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function validateSandboxDraftConfig(config: JsonObject) {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hotelName = String(config.hotelName ?? "").trim();
  if (!hotelName) errors.push("HOTEL_NAME_REQUIRED");

  const languages = Array.isArray(config.languages)
    ? config.languages
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter(Boolean)
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

  const timezone = String(config.hotelTimezone ?? "").trim();
  if (!timezone) {
    errors.push("HOTEL_TIMEZONE_INVALID");
  } else {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    } catch {
      errors.push("HOTEL_TIMEZONE_INVALID");
    }
  }

  const rooms = Array.isArray(config.hotelRooms) ? config.hotelRooms : [];
  const roomNumbers = rooms
    .map((room) =>
      isPlainObject(room) ? String(room.roomNumber ?? "").trim() : "",
    )
    .filter(Boolean);

  if (!roomNumbers.length) errors.push("ACTIVE_ROOMS_REQUIRED");
  if (new Set(roomNumbers).size !== roomNumbers.length) {
    errors.push("ROOM_NUMBER_DUPLICATED");
  }

  const requestDefs = Array.isArray(config.requestDefs) ? config.requestDefs : [];
  const requestIds = requestDefs
    .map((definition) =>
      isPlainObject(definition) ? String(definition.id ?? "").trim() : "",
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

export async function cloneSandboxConfigFromProduction(
  options: CloneSandboxConfigOptions,
): Promise<CloneSandboxConfigResult> {
  const sandboxHotelSlug = requiredText(
    options.sandboxHotelSlug,
    "M11_SANDBOX_HOTEL_SLUG_REQUIRED",
  );
  const expectedProductionRevisionId = requiredText(
    options.expectedProductionRevisionId,
    "M11_PRODUCTION_REVISION_ID_REQUIRED",
  );

  const sandboxHotel = await resolveHotelByAnySlugAdmin(sandboxHotelSlug);

  if (!isSandboxHotel(sandboxHotel)) {
    throw new Error("M11_SANDBOX_HOTEL_REQUIRED");
  }

  if (!sandboxHotel.production_hotel_id) {
    throw new Error("M11_SANDBOX_PRODUCTION_LINK_REQUIRED");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "clone_production_config_to_sandbox_draft",
    {
      p_sandbox_hotel_id: sandboxHotel.id,
      p_expected_production_revision_id: expectedProductionRevisionId,
      p_actor: String(options.actor || "m11_sandbox_clone").trim(),
    },
  );

  if (error) {
    throw new Error(`M11_SANDBOX_CONFIG_CLONE_FAILED: ${error.message}`);
  }

  const result = (data || {}) as CloneSandboxConfigResult;

  if (
    result.ok !== true ||
    result.sandbox_hotel_id !== sandboxHotel.id ||
    result.production_hotel_id !== sandboxHotel.production_hotel_id ||
    result.production_revision_id !== expectedProductionRevisionId ||
    !result.revision_id
  ) {
    throw new Error("M11_SANDBOX_CONFIG_CLONE_RESULT_INVALID");
  }

  return result;
}

export async function createSandboxManualConfigDraft(
  options: CreateSandboxManualDraftOptions,
): Promise<CreateSandboxManualDraftResult> {
  const sandboxHotelSlug = requiredText(
    options.sandboxHotelSlug,
    "M11_SANDBOX_HOTEL_SLUG_REQUIRED",
  );
  const baseRevisionId = requiredText(
    options.baseRevisionId,
    "M11_SANDBOX_BASE_REVISION_REQUIRED",
  );

  if (!isPlainObject(options.patch) || Object.keys(options.patch).length === 0) {
    throw new Error("M11_SANDBOX_CONFIG_PATCH_REQUIRED");
  }

  const forbiddenKeys = Object.keys(options.patch).filter((key) =>
    RUNTIME_IDENTITY_KEYS.has(key),
  );
  if (forbiddenKeys.length) {
    throw new Error(`M11_SANDBOX_RUNTIME_IDENTITY_IMMUTABLE:${forbiddenKeys.join(",")}`);
  }

  const sandboxHotel = await resolveHotelByAnySlugAdmin(sandboxHotelSlug);
  if (!isSandboxHotel(sandboxHotel)) {
    throw new Error("M11_SANDBOX_HOTEL_REQUIRED");
  }
  if (!sandboxHotel.production_hotel_id) {
    throw new Error("M11_SANDBOX_PRODUCTION_LINK_REQUIRED");
  }

  const { data: baseRevision, error: baseError } = await supabaseAdmin
    .from("hotel_config_revisions")
    .select(
      "id, hotel_id, status, source_checksum, config_json, provenance_json, validation_json",
    )
    .eq("hotel_id", sandboxHotel.id)
    .eq("id", baseRevisionId)
    .in("status", ["draft", "published"])
    .maybeSingle();

  if (baseError) {
    throw new Error(`M11_SANDBOX_BASE_REVISION_LOOKUP_FAILED:${baseError.message}`);
  }
  if (!baseRevision) {
    throw new Error("M11_SANDBOX_BASE_REVISION_NOT_FOUND");
  }

  const base = baseRevision as SandboxBaseRevisionRow;
  if (
    !isPlainObject(base.config_json) ||
    !isPlainObject(base.provenance_json) ||
    !isPlainObject(base.validation_json) ||
    base.validation_json.ok !== true
  ) {
    throw new Error("M11_SANDBOX_BASE_REVISION_INVALID");
  }

  const changedKeys = Object.keys(options.patch).sort();
  const config = canonicalize({
    ...base.config_json,
    ...options.patch,
  }) as JsonObject;
  const validation = validateSandboxDraftConfig(config);

  if (!validation.ok) {
    throw new Error(`M11_SANDBOX_CONFIG_VALIDATION_FAILED:${validation.errors.join(",")}`);
  }

  const editedAt = new Date().toISOString();
  const provenance = {
    ...base.provenance_json,
    ...Object.fromEntries(
      changedKeys.map((key) => [
        key,
        {
          source: "sandbox_manual",
          baseSandboxRevisionId: base.id,
          baseSourceChecksum: base.source_checksum,
          editedAt,
        },
      ]),
    ),
  };
  const sourceChecksum = sha256Json(config);
  const sourceMetadata = {
    editKind: "sandbox_manual_patch",
    sandboxHotelId: sandboxHotel.id,
    productionHotelId: sandboxHotel.production_hotel_id,
    baseSandboxRevisionId: base.id,
    baseSourceChecksum: base.source_checksum,
    changedKeys,
    editedAt,
  };

  const { data, error } = await supabaseAdmin.rpc("create_hotel_config_draft", {
    p_hotel_id: sandboxHotel.id,
    p_source_type: "manual",
    p_source_checksum: sourceChecksum,
    p_config_json: config,
    p_provenance_json: provenance,
    p_source_metadata_json: sourceMetadata,
    p_validation_json: validation,
    p_actor: String(options.actor || "m11_sandbox_manual_edit").trim(),
  });

  if (error) {
    throw new Error(`M11_SANDBOX_MANUAL_DRAFT_CREATE_FAILED:${error.message}`);
  }

  const result = (data || {}) as CreateSandboxManualDraftResult;
  if (
    result.ok !== true ||
    result.hotel_id !== sandboxHotel.id ||
    !result.revision_id ||
    !result.source_checksum
  ) {
    throw new Error("M11_SANDBOX_MANUAL_DRAFT_RESULT_INVALID");
  }

  return result;
}
