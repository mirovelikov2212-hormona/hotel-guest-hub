export type HotelScannerV2Heading = {
  level: number;
  text: string;
};

export type HotelScannerV2JsonLdEntity = {
  name: string;
  types: string[];
};

export type HotelScannerV2PageStructure = {
  headings: HotelScannerV2Heading[];
  jsonLdEntities: HotelScannerV2JsonLdEntity[];
};

export function extractHotelPageStructureV2(html?: unknown): HotelScannerV2PageStructure;
