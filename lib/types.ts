export type LangKey = "bg" | "de" | "en";

export type HubItem =
  | { kind: "link"; label: string; href: string }
  | { kind: "info"; label: string; info: string };

export type HubSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: HubItem[];
};

export type HotelConfig = {
  hotelSlug: string;
  hotelName: string;
  coverImage: string;
  languages: LangKey[];
  languageDefault: LangKey;
  housekeepingCutoff?: string;
  wifi: { ssid: string; password: string };
  contacts: {
    reception: { phone: string; whatsapp: string };
    housekeeping: { whatsapp: string };
    restaurant: { whatsapp: string };
    events: { whatsapp: string };
    maintenance: { whatsapp: string };
  };
  location: { query: string };
  reviews: { google?: string; tripadvisor?: string };
  i18n: Record<LangKey, Record<string, string>>;
};
