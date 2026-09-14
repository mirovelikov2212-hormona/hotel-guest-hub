export type HotelTechnologyClassification =
  | "CONFIRMED PUBLIC EVIDENCE"
  | "LIKELY"
  | "UNKNOWN"
  | "NOT PUBLICLY EVIDENCED";

export const HOTEL_TECHNOLOGY_CLASSIFICATIONS: HotelTechnologyClassification[];

export type HotelTechnologyEvidenceItem = {
  kind: string;
  value: string;
  sourceUrl: string;
};

export type HotelTechnologyProviderSignal = {
  id: string;
  provider: string;
  category: string;
  classification: "CONFIRMED PUBLIC EVIDENCE";
  evidence: HotelTechnologyEvidenceItem[];
};

export type HotelTechnologyDiscovery = {
  schemaVersion: "hotel-technology-discovery-v1";
  classifications: HotelTechnologyClassification[];
  providers: HotelTechnologyProviderSignal[];
  capabilities: {
    bookingTechnology: { classification: HotelTechnologyClassification; urls: string[] };
    guestAccountPortal: { classification: HotelTechnologyClassification; urls: string[] };
    operationalGuestHub: {
      classification: HotelTechnologyClassification;
      evidence: HotelTechnologyEvidenceItem[];
      note: string;
    };
    publicWebAppSurface: {
      classification: HotelTechnologyClassification;
      manifestUrls: string[];
      serviceWorkerUrls: string[];
    };
  };
  subdomains: string[];
  rawSignals: {
    externalLinks: string[];
    scriptSrcs: string[];
    iframeSrcs: string[];
    formActions: string[];
    manifestUrls: string[];
    serviceWorkerUrls: string[];
  };
  scope: {
    scannedPageCount: number;
    scannedUrls: string[];
    boundedPublicEvidenceOnly: true;
    absenceClaimsForbidden: true;
  };
};

export function buildHotelTechnologyDiscovery(evidence?: unknown): HotelTechnologyDiscovery;
