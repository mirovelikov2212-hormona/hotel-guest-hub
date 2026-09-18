import type { HotelIntakePipelineV2Result } from "./hotel-scanner-v2-pipeline";

export function shouldCompactHotelScannerResultForPersistenceV2(
  result: HotelIntakePipelineV2Result,
): boolean;

export function compactHotelScannerResultForPersistenceV2(
  result: HotelIntakePipelineV2Result,
): HotelIntakePipelineV2Result;

export const HOTEL_SCANNER_V2_PERSISTENCE_PROJECTION_LIMITS: Readonly<{
  resourceThreshold: number;
  relationThreshold: number;
}>;
