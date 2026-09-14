import type { HotelScanProfile } from "./hotel-scanner";

export type HotelIntelligenceValueValidation = {
  valid: boolean;
  kind: "empty" | "email" | "address" | "generic";
  reason: string | null;
  normalizedValue?: string;
};

export type InvalidHotelIntelligenceValue = {
  path: string;
  category: string;
  label: string;
  value: string;
  kind: string;
  reason: string | null;
};

export function validateHotelIntelligenceValue(input?: {
  category?: unknown;
  label?: unknown;
  value?: unknown;
}): HotelIntelligenceValueValidation;

export function sanitizeHotelScanProfileValues(profile: HotelScanProfile): {
  profile: HotelScanProfile;
  invalidValues: InvalidHotelIntelligenceValue[];
};

export function findInvalidHotelProfileValues(profile: unknown): InvalidHotelIntelligenceValue[];
