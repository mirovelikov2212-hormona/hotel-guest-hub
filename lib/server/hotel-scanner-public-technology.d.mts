export type HotelScannerRawTechnologySignals = {
  externalLinks: string[];
  scriptSrcs: string[];
  iframeSrcs: string[];
  formActions: string[];
  manifestUrls: string[];
  serviceWorkerUrls: string[];
};

export function extractPublicTechnologySignals(
  htmlInput: string,
  baseUrlInput: string | URL,
): HotelScannerRawTechnologySignals;
