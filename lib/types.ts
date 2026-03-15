export type LangKey = "bg" | "en" | "de" | "tr" | string;

export type DepartmentKey =
  | "reception"
  | "housekeeping"
  | "maintenance"
  | "restaurant"
  | "events";

export type HubItem =
  | {
      label: string;
      kind: "info";
      info: string;
    }
  | {
      label: string;
      kind: "link";
      href?: string;
      newTab?: boolean;
      onClick?: () => void;
    }
  | {
      label: string;
      kind: "custom";
      onClick?: () => void;
    };

export type HubSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: HubItem[];
};

export type ContactInfo = {
  phone?: string;
  whatsapp?: string;
};

export type DepartmentHours = Partial<
  Record<
    DepartmentKey,
    {
      open: string;
      close: string;
    }
  >
>;

export type TaxiProvider = {
  name: string;
  url?: string;
  phone?: string;
};

export type ReviewLinks = {
  google?: string;
  tripadvisor?: string;
};

export type VenueRow = {
  category?: string;
  type?: string;
  name: string;
  active?: boolean;
  sortOrder?: number | string;

  shortDescription?: string;
  description?: string;
  cuisine?: string;
  hours?: string;
  open?: string;
  close?: string;
  menuUrl?: string;
  location?: string;

  requiresReservation?: boolean;

  reservationType?: "whatsapp" | "phone" | "url" | "email" | "none";
  reservationUrl?: string;
  reservationPhone?: string;
  reservationWhatsapp?: string;
  reservationEmail?: string;
  reservationLabel?: string;
  reservationMessage?: string;

  programUrl?: string;
  programText?: string;
  ageGroup?: string;

  whatsapp?: string;
  phone?: string;
};

export type HotelConfig = {
  hotelSlug?: string;
  hotelName: string;
  coverImage: string;
  coverImagePosition?: string;

  languageDefault?: LangKey;
  languages: LangKey[];
  opsLanguage?: LangKey;
  staffHelperEnabled?: boolean;
  staffHelperLanguage?: LangKey;

  i18n?: Record<string, Record<string, string>>;

  wifi: {
    ssid: string;
    password: string;
  };

  location: {
    query: string;
  };

  contacts: {
    reception: ContactInfo;
    housekeeping: ContactInfo;
    maintenance: ContactInfo;
    restaurant: ContactInfo;
    events: ContactInfo;
  };

  departmentHours?: DepartmentHours;
  housekeepingCutoff?: string;

  housekeepingExtras?: Array<{
    key: string;
    labelKey: string;
    messageKey: string;
  }>;

  taxiProviders?: TaxiProvider[];
  reviews: ReviewLinks;

  venueRows?: VenueRow[];
};