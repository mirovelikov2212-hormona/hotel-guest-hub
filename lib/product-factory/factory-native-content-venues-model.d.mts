export type FactoryNativeContentVenueResources = {
  schema_version: string;
  wifi: { ssid: string; password: string };
  hotel_info_items: Array<Record<string, unknown>>;
  venues: Array<Record<string, unknown>>;
};

export function prepareFactoryNativeContentVenues(input: {
  blueprint: Record<string, unknown>;
}): {
  blueprint: Record<string, unknown>;
  blueprintHash: string;
  nativeResources: FactoryNativeContentVenueResources;
  nativeResourcesHash: string;
  counts: {
    hotelInfoItems: number;
    activeHotelInfoItems: number;
    venues: number;
    activeVenues: number;
    venueTypes: number;
  };
};

export const FACTORY_NATIVE_CONTENT_VENUES_SCHEMA_VERSION: string;
export const FACTORY_COMMON_VENUE_TYPES: readonly string[];
export const FACTORY_NATIVE_RESERVATION_TYPES: readonly string[];
