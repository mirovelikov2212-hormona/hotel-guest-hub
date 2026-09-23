export type HistoricalServiceIdentitySnapshot = {
  schemaVersion: "service-identity-snapshot-v1";
  serviceKey: string;
  sourceRequestDef: string | null;
  requestType: string;
  canonicalRequestType: string;
  title: string | null;
  configRevisionId: string | null;
  configSourceChecksum: string | null;
};

export function buildHistoricalServiceIdentitySnapshot(
  input?: Record<string, unknown>,
): HistoricalServiceIdentitySnapshot;

export function readHistoricalServiceIdentitySnapshot(
  metadata: unknown,
): HistoricalServiceIdentitySnapshot | null;

export const HISTORICAL_SERVICE_IDENTITY_SCHEMA_VERSION:
  "service-identity-snapshot-v1";
