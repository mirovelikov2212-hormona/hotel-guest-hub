import "server-only";

import {
  GOSTAYA_VALUE_BASELINE_SCHEMA_VERSION,
  normalizeGostayaValueBaseline,
} from "@/lib/value/gostaya-value-measurement.mjs";
import {
  canMutateControlPlane,
  type PlatformAdminAuthority,
} from "@/lib/server/control-plane-auth";
import { logControlPlaneAudit } from "@/lib/server/control-plane-audit";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const VALUE_BASELINE_SETTING_KEY = "gostaya_value_baseline_v1";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function uuid(value: unknown, code: string) {
  const id = text(value).toLowerCase();
  if (!UUID_RE.test(id)) throw new Error(code);
  return id;
}

function expectedRevision(value: unknown) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("VALUE_BASELINE_EXPECTED_REVISION_INVALID");
  }
  return revision;
}

async function resolvePropertyTarget(propertyId: string) {
  const [propertyResult, environmentResult] = await Promise.all([
    supabaseAdmin
      .from("properties")
      .select("id,organization_id")
      .eq("id", propertyId)
      .maybeSingle(),
    supabaseAdmin
      .from("property_environments")
      .select("hotel_id")
      .eq("property_id", propertyId)
      .eq("environment", "production")
      .maybeSingle(),
  ]);

  if (propertyResult.error || !propertyResult.data) {
    throw new Error("VALUE_BASELINE_PROPERTY_NOT_FOUND");
  }
  if (environmentResult.error || !environmentResult.data?.hotel_id) {
    throw new Error("VALUE_BASELINE_PRODUCTION_HOTEL_REQUIRED");
  }

  return {
    propertyId: String(propertyResult.data.id),
    organizationId: String(propertyResult.data.organization_id),
    hotelId: String(environmentResult.data.hotel_id),
  };
}

async function readSetting(hotelId: string) {
  const { data, error } = await supabaseAdmin
    .from("hotel_settings")
    .select("id,value_json,updated_at")
    .eq("hotel_id", hotelId)
    .eq("key", VALUE_BASELINE_SETTING_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`VALUE_BASELINE_READ_FAILED:${error.message}`);
  }

  return data || null;
}

export async function getHotelActualGoLiveAt(hotelIdInput: unknown) {
  const hotelId = uuid(hotelIdInput, "VALUE_BASELINE_HOTEL_ID_INVALID");

  const { data, error } = await supabaseAdmin
    .from("factory_production_live_activation_runs")
    .select("created_at")
    .eq("production_hotel_id", hotelId)
    .eq("status", "live")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`VALUE_GOLIVE_READ_FAILED:${error.message}`);
  }

  return data?.created_at ? String(data.created_at) : null;
}

export async function getHotelGostayaValueBaseline(hotelIdInput: unknown) {
  const hotelId = uuid(hotelIdInput, "VALUE_BASELINE_HOTEL_ID_INVALID");
  const row = await readSetting(hotelId);

  if (!row) return null;

  const baseline = normalizeGostayaValueBaseline(row.value_json);
  const metadata =
    row.value_json
    && typeof row.value_json === "object"
    && !Array.isArray(row.value_json)
      ? (row.value_json as Record<string, unknown>).metadata
      : null;

  return {
    ...baseline,
    metadata:
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata
        : {},
  };
}

export async function getPropertyGostayaValueBaseline(
  propertyIdInput: unknown,
) {
  const propertyId = uuid(
    propertyIdInput,
    "VALUE_BASELINE_PROPERTY_ID_INVALID",
  );
  const target = await resolvePropertyTarget(propertyId);
  const [row, goLiveAt] = await Promise.all([
    readSetting(target.hotelId),
    getHotelActualGoLiveAt(target.hotelId),
  ]);

  if (!row) {
    return {
      ...target,
      stored: false,
      revision: 0,
      baseline: null,
      goLiveAt,
      locked: Boolean(goLiveAt),
      historicalBackfillAvailable: Boolean(goLiveAt),
    };
  }

  const baseline = normalizeGostayaValueBaseline(row.value_json);
  const raw =
    row.value_json
    && typeof row.value_json === "object"
    && !Array.isArray(row.value_json)
      ? (row.value_json as Record<string, unknown>)
      : {};
  const metadata =
    raw.metadata
    && typeof raw.metadata === "object"
    && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : {};

  return {
    ...target,
    stored: true,
    revision: baseline.revision,
    baseline,
    metadata,
    goLiveAt,
    locked: Boolean(goLiveAt),
    historicalBackfillAvailable: false,
  };
}

function buildCandidate(input: {
  currentRevision: number;
  baseline: unknown;
  goLiveAt: string | null;
}) {
  const raw =
    input.baseline
    && typeof input.baseline === "object"
    && !Array.isArray(input.baseline)
      ? (input.baseline as Record<string, unknown>)
      : {};

  const normalized = normalizeGostayaValueBaseline({
    ...raw,
    schemaVersion: GOSTAYA_VALUE_BASELINE_SCHEMA_VERSION,
    revision: input.currentRevision + 1,
  });

  if (
    input.goLiveAt
    && Date.parse(normalized.baselinePeriod.to)
      > Date.parse(input.goLiveAt)
  ) {
    throw new Error("VALUE_BASELINE_MUST_PRECEDE_ACTUAL_GOLIVE");
  }

  return {
    ...normalized,
    metadata: {
      capturedAt: new Date().toISOString(),
      capturedAfterGoLive: Boolean(input.goLiveAt),
      actualGoLiveAtAtCapture: input.goLiveAt,
      immutableAfterGoLive: true,
    },
  };
}

export async function updatePropertyGostayaValueBaseline(input: {
  authority: PlatformAdminAuthority;
  propertyId: unknown;
  expectedRevision: unknown;
  baseline: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("VALUE_BASELINE_FACTORY_ADMIN_FORBIDDEN");
  }

  const propertyId = uuid(
    input.propertyId,
    "VALUE_BASELINE_PROPERTY_ID_INVALID",
  );
  const revision = expectedRevision(input.expectedRevision);
  const target = await resolvePropertyTarget(propertyId);
  const [currentRow, goLiveAt] = await Promise.all([
    readSetting(target.hotelId),
    getHotelActualGoLiveAt(target.hotelId),
  ]);

  let currentBaseline:
    | ReturnType<typeof normalizeGostayaValueBaseline>
    | null = null;

  if (currentRow) {
    currentBaseline = normalizeGostayaValueBaseline(
      currentRow.value_json,
    );
  }

  const currentRevision = currentBaseline?.revision ?? 0;
  if (currentRevision !== revision) {
    throw new Error("VALUE_BASELINE_REVISION_CONFLICT");
  }

  if (goLiveAt && currentRow) {
    throw new Error("VALUE_BASELINE_LOCKED_AFTER_GOLIVE");
  }

  const candidate = buildCandidate({
    currentRevision,
    baseline: input.baseline,
    goLiveAt,
  });

  let writtenRow: { id: string; updated_at: string } | null = null;

  if (currentRow) {
    const { data, error } = await supabaseAdmin
      .from("hotel_settings")
      .update({
        value_json: candidate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentRow.id)
      .eq("hotel_id", target.hotelId)
      .eq("key", VALUE_BASELINE_SETTING_KEY)
      .eq("updated_at", currentRow.updated_at)
      .select("id,updated_at")
      .maybeSingle();

    if (error) {
      throw new Error(`VALUE_BASELINE_WRITE_FAILED:${error.message}`);
    }
    if (!data) {
      throw new Error("VALUE_BASELINE_REVISION_CONFLICT");
    }

    writtenRow = {
      id: String(data.id),
      updated_at: String(data.updated_at),
    };
  } else {
    const { data, error } = await supabaseAdmin
      .from("hotel_settings")
      .insert({
        hotel_id: target.hotelId,
        key: VALUE_BASELINE_SETTING_KEY,
        value_json: candidate,
      })
      .select("id,updated_at")
      .single();

    if (error || !data) {
      if (String(error?.code || "") === "23505") {
        throw new Error("VALUE_BASELINE_REVISION_CONFLICT");
      }
      throw new Error(
        `VALUE_BASELINE_WRITE_FAILED:${error?.message || "empty"}`,
      );
    }

    writtenRow = {
      id: String(data.id),
      updated_at: String(data.updated_at),
    };
  }

  try {
    await logControlPlaneAudit({
      actorAdminId: input.authority.adminId,
      organizationId: target.organizationId,
      propertyId: target.propertyId,
      hotelId: target.hotelId,
      action: goLiveAt
        ? "gostaya_value_baseline_historical_backfill_created"
        : "gostaya_value_baseline_updated",
      resourceType: "hotel_setting",
      resourceId: writtenRow.id,
      metadata: {
        schemaVersion: candidate.schemaVersion,
        previousRevision: currentRevision,
        revision: candidate.revision,
        baselinePeriod: candidate.baselinePeriod,
        currency: candidate.currency,
        capturedAfterGoLive: Boolean(goLiveAt),
        actualGoLiveAt: goLiveAt,
      },
    });
  } catch (auditError) {
    if (currentRow) {
      await supabaseAdmin
        .from("hotel_settings")
        .update({
          value_json: currentRow.value_json,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentRow.id)
        .eq("hotel_id", target.hotelId)
        .eq("key", VALUE_BASELINE_SETTING_KEY)
        .eq("updated_at", writtenRow.updated_at);
    } else {
      await supabaseAdmin
        .from("hotel_settings")
        .delete()
        .eq("id", writtenRow.id)
        .eq("hotel_id", target.hotelId)
        .eq("key", VALUE_BASELINE_SETTING_KEY);
    }
    throw auditError;
  }

  return {
    ...target,
    stored: true,
    revision: candidate.revision,
    baseline: normalizeGostayaValueBaseline(candidate),
    metadata: candidate.metadata,
    goLiveAt,
    locked: Boolean(goLiveAt),
    historicalBackfillAvailable: false,
  };
}
