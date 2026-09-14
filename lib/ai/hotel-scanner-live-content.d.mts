export type HotelScannerBridgeKind = "events" | "offers";
export type HotelScannerBridgeState = "active" | "scheduled" | "expired" | "undated_active";

export interface HotelScannerBridgeItem {
  key: string;
  kind: HotelScannerBridgeKind;
  title: string;
  startsOn: string;
  endsOn: string;
  datePrecision: "day" | "month" | "unknown";
  state: HotelScannerBridgeState;
  sourceUrls: string[];
  fingerprint: string;
}

export interface HotelScannerBridgeSnapshot {
  schemaVersion: "stayhub-scanner-bridge-v1";
  scannedAt: string;
  cadence: "daily";
  removalPolicy: "remove_after_successful_section_absence";
  expiryPolicy: "hide_after_explicit_end_date";
  items: HotelScannerBridgeItem[];
  activeItems: HotelScannerBridgeItem[];
}

export function parseHotelLiveContentValidity(value: unknown): { startsOn: string; endsOn: string; precision: "day" | "month" | "unknown" };
export function hotelLiveContentTemporalState(validity: { startsOn?: string; endsOn?: string }, scannedAt?: string): HotelScannerBridgeState;
export function buildHotelScannerBridgeSnapshot(facts?: unknown[], scannedAt?: string): HotelScannerBridgeSnapshot;
export function diffHotelScannerBridgeSnapshots(previous: HotelScannerBridgeSnapshot | null | undefined, current: HotelScannerBridgeSnapshot | null | undefined, options?: { successfulKinds?: HotelScannerBridgeKind[] }): {
  schemaVersion: "stayhub-scanner-bridge-diff-v1";
  added: HotelScannerBridgeItem[];
  updated: Array<{ before: HotelScannerBridgeItem; after: HotelScannerBridgeItem }>;
  removed: HotelScannerBridgeItem[];
  expired: HotelScannerBridgeItem[];
  active: HotelScannerBridgeItem[];
};
