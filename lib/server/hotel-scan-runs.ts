import "server-only";

import { buildHotelIntelligenceSourceKey } from "@/lib/server/hotel-intelligence-revisions";
import {
  buildHotelScanRunIdempotencyKey,
  prepareHotelScanRunPayload,
  type PreparedHotelScanRunPayload,
} from "@/lib/server/hotel-scan-run-payload.mjs";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type PersistableHotelScanRun = PreparedHotelScanRunPayload & {
  sourceKey: string;
  idempotencyKey: string;
};

export function hotelScanRunPersistenceEnabled() {
  return process.env.HOTEL_SCAN_RUN_PERSISTENCE_ENABLED === "true";
}

export function preparePersistableHotelScanRun(input: {
  actorAdminId: string;
  requestedUrl: string;
  canonicalUrl: string;
  scannedAt: string;
  scannedUrls: string[];
  profile: unknown;
  reconciliation: unknown;
  invalidValues: unknown;
  conflicts: unknown;
  conflictNotes: unknown;
  coverage: unknown;
  reviewSemantics: unknown;
  technologyDiscovery: unknown;
  rawDesignSignals: unknown;
  refinedDesignSignals: unknown;
  assetPolicy: unknown;
  scannerVersion?: string;
  model?: unknown;
  coreMode?: unknown;
  outputLanguage?: unknown;
  diagnostics?: unknown;
}): PersistableHotelScanRun {
  const prepared = prepareHotelScanRunPayload(input as unknown as Record<string, unknown>);
  const sourceKey = buildHotelIntelligenceSourceKey(prepared.canonicalUrl);
  const idempotencyKey = buildHotelScanRunIdempotencyKey({
    actorAdminId: input.actorAdminId,
    scannedAt: prepared.scannedAt,
    evidenceChecksum: prepared.evidenceChecksum,
  });
  return {
    ...prepared,
    sourceKey,
    idempotencyKey,
  };
}

export async function createHotelScanRun(input: PersistableHotelScanRun & { actorAdminId: string }) {
  const { data, error } = await supabaseAdmin.rpc("create_hotel_scan_run_v1", {
    p_actor_admin_id: input.actorAdminId,
    p_source_key: input.sourceKey,
    p_requested_url: input.requestedUrl,
    p_canonical_url: input.canonicalUrl,
    p_scanned_urls: input.scannedUrls,
    p_schema_version: input.schemaVersion,
    p_idempotency_key: input.idempotencyKey,
    p_evidence_checksum: input.evidenceChecksum,
    p_evidence: input.evidenceSnapshot,
    p_technology: input.technologySignals,
    p_design_signals: input.designSignals,
    p_scanner_metadata: input.scannerMetadata,
    p_diagnostics: input.diagnostics,
    p_scanned_at: input.scannedAt,
  });
  if (error) throw new Error(`HOTEL_SCAN_RUN_CREATE_FAILED:${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error("HOTEL_SCAN_RUN_CREATE_EMPTY_RESULT");
  return {
    scanRunId: String(row.scan_run_id),
    sourceKey: input.sourceKey,
    evidenceChecksum: String(row.evidence_checksum || input.evidenceChecksum),
    scannedAt: String(row.scanned_at || input.scannedAt),
    replayed: Boolean(row.replayed),
  };
}
