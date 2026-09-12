export type HotelScannerV2Heading = {
  level: number;
  text: string;
};

export type HotelScannerV2JsonLdEntity = {
  name: string;
  types: string[];
};

export type HotelScannerV2ContentBlock = {
  level: number;
  heading: string;
  text: string;
  links: string[];
};

export type HotelScannerV2PageStructure = {
  headings: HotelScannerV2Heading[];
  jsonLdEntities: HotelScannerV2JsonLdEntity[];
  contentBlocks: HotelScannerV2ContentBlock[];
};

export function extractHotelPageStructureV2(html?: unknown): HotelScannerV2PageStructure;
