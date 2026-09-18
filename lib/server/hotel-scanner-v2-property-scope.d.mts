export type HotelPropertyScopeV2 = {
  mode: "ORIGIN" | "PATH_ROOT";
  origin: string;
  rootSegments: string[];
  rootPath: string;
  identityTokens: string[];
  primaryIdentityToken: string;
};

export function deriveHotelPropertyScopeV2(
  requestedUrl: string,
  canonicalUrl?: string,
): HotelPropertyScopeV2;

export function isHotelPropertyPageUrlInScopeV2(
  rawUrl: string,
  scope?: HotelPropertyScopeV2,
): boolean;

export function isHotelPropertyDocumentUrlInScopeV2(
  rawUrl: string,
  scope?: HotelPropertyScopeV2,
  options?: { directlyLinkedFromProperty?: boolean },
): boolean;

export function filterHotelPropertyPageUrlsV2(
  values?: string[],
  scope?: HotelPropertyScopeV2,
): string[];
