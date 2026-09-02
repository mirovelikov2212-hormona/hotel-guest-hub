import type { HotelConfig } from "../types";

export const HOTEL_CONFIG_REVISION_STATUSES: readonly string[];
export const HOTEL_CONFIG_SOURCE_TYPES: readonly string[];

export function normalizePublishedHotelConfigRuntime(input: unknown): {
  config: HotelConfig;
  compatibilityDefaultsApplied: string[];
};

export function validatePublishedHotelConfigRuntimeShape(
  input: unknown,
  options?: { requireCanonicalRequestDefs?: boolean },
): {
  ok: boolean;
  errors: string[];
  compatibilityDefaultsApplied: string[];
};

export function validateHotelConfigRevisionEnvelope(input: unknown): {
  ok: boolean;
  errors: string[];
};
