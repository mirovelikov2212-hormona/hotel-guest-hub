import type { HotelScanProfile } from "./hotel-scanner";

export function isPrivacyMinimalHotelBusinessEmail(value: unknown): boolean;

export function applyPrivacyMinimalHotelProjection(inputProfile: HotelScanProfile): {
  profile: HotelScanProfile;
  filtered: Array<{ path: string; reason: string; kind: string }>;
  policy: {
    schemaVersion: "hotel-scanner-privacy-v1";
    scope: "public_business_information_only";
    personalProfileEnrichment: false;
    directPersonContactProjection: false;
  };
};
