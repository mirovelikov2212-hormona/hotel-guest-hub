export type HotelScannerRobotsPolicy = {
  schemaVersion: "hotel-scanner-robots-v1";
  userAgentToken: string;
  rules: Array<{ allow: boolean; pattern: string }>;
  sitemaps: string[];
};

export function buildHotelScannerRobotsPolicy(textValue: unknown, userAgentToken?: string): HotelScannerRobotsPolicy;
export function isHotelScannerRobotsAllowed(rawUrl: unknown, policy: HotelScannerRobotsPolicy): boolean;
