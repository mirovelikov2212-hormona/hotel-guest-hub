// lib/types.ts
export type LangKey = "bg" | "de" | "en" | string;

export type DepartmentKey =
  | "reception"
  | "housekeeping"
  | "restaurant"
  | "events"
  | "maintenance";

export type HubItem =
  | {
      kind: "info";
      label?: string;
      info: string;
    }
  | {
      kind: "link";
      label: string;
      href?: string;
      // optional: allow custom behavior (prompt, routing, etc.)
      onClick?: () => void;
      // open in new tab for http(s) links
      newTab?: boolean;
    };

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
  languageDefault?: LangKey;

  // NEW: language of operational WhatsApp messages (to staff)
  opsLanguage?: LangKey;

  // NEW: optional helper line (e.g. English) to support multicultural staff
  staffHelperEnabled?: boolean;
  staffHelperLanguage?: LangKey;

  // NEW: per-department hours; if department closed → route to reception
  departmentHours?: Partial<
    Record<DepartmentKey, { open: string; close: string }>
  >;

  // legacy fallback (still supported)
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

  reviews: { google: string; tripadvisor: string };

  taxiProviders?: Array<{ name: string; phone?: string; url?: string }>;

  i18n?: Record<string, Record<string, string>>;
};
