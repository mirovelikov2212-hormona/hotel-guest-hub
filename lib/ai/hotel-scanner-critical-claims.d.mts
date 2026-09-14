export type HotelScannerCriticalClaim = {
  category: string;
  subject: string;
  attribute: string;
  label: string;
  value: string;
  confidence: number;
  sourceUrls: string[];
};

export function extractHotelScannerCriticalClaims(
  pages?: Array<{ url?: string; title?: string; text?: string }>,
  outputLanguage?: "bg" | "en",
): HotelScannerCriticalClaim[];
