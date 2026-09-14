import type { HotelScanProfile, HotelScannerOutputLanguage } from "./hotel-scanner";

export type HotelScanConflictClaim = {
  category: string;
  label: string;
  value: string;
  confidence: number;
  sourceUrls: string[];
  polarity: "allowed" | "prohibited" | "unknown" | null;
};

export type HotelScanConflict = {
  id: string;
  topic: string;
  topicLabel: string;
  state: "CONFLICT";
  reviewRequired: true;
  claims: HotelScanConflictClaim[];
  sourceUrls: string[];
};

export function detectHotelScanConflicts(profile: HotelScanProfile): HotelScanConflict[];

export function attachHotelScanConflictReview(
  profile: HotelScanProfile,
  conflicts: HotelScanConflict[],
  outputLanguage?: HotelScannerOutputLanguage,
): {
  profile: HotelScanProfile;
  conflictNotes: string[];
};
