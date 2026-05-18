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


export type RequestDefTextMap = Partial<Record<LangKey, string>>;

export type RequestDefType = "request" | "info" | "policy";

export type RequestDefKind =
  | "standard"
  | "selection"
  | "quantity"
  | "time_slot"
  | "info_only";

export type RequestDefTimeMode = "free" | "slots" | "none";

export type RequestDefConfirmationMode =
  | "instant"
  | "staff_required"
  | "policy_only";

export type RequestDef = {
  id: string;
  type: RequestDefType;
  category: string;
  enabled: boolean;
  sortOrder: number;
  icon?: string;
  requestKind: RequestDefKind;
  targetDepartment?: StaffDepartment | "none" | string;
  requestType?: StaffRequestType | string;
  requiresNote: boolean;
  requiresQuantity: boolean;
  minQty?: number;
  maxQty?: number;
  requiresTime: boolean;
  timeMode: RequestDefTimeMode;
  options: string[];
  guestVisible: boolean;
  staffVisible: boolean;
  aiVisible: boolean;
  confirmationMode: RequestDefConfirmationMode;
  title: RequestDefTextMap;
  subtitle: RequestDefTextMap;
  description: RequestDefTextMap;
  policy: RequestDefTextMap;
  success: RequestDefTextMap;
  staffLabel: RequestDefTextMap;
  keywords: string[];
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
  icon?: string;

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

export type HotelInfoItem = {
  key: string;
  category?: string;
  sortOrder?: number;
  icon?: string;
  active?: boolean;
  title: RequestDefTextMap;
  text: RequestDefTextMap;
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
  hotelInfoItems?: HotelInfoItem[];
  requestDefs?: RequestDef[];
};

export type StaffRequestType =
  | "towels"
  | "toilet_paper"
  | "extra_pillow"
  | "extra_blanket"
  | "bathrobe"
  | "slippers"
  | "baby_cot"
  | "air_conditioning"
  | "light_not_working"
  | "no_hot_water"
  | "tv_issue"
  | "bathroom_issue"
  | "other_technical_issue"
  | "taxi"
  | "late_checkout"
  | "wake_up_call"
  | "information"
  | "restaurant_reservation"
  | "iron"
  | "minibar";

  export type StaffDepartment =
  | "housekeeping"
  | "maintenance"
  | "reception"
  | "restaurant";

export type StaffRequestStatus =
  | "new"
  | "in_progress"
  | "completed"
  | "returned";

export type StaffServiceTime = "now" | "today" | "tomorrow";

export type StaffRequest = {
  id: string;
  room: string;
  department: StaffDepartment;
  type: StaffRequestType;
  typeLabel: string;
  status: StaffRequestStatus;
  serviceTime: StaffServiceTime;
  createdAt: string;
  createdAtIso: string;
  createdDateKey: string;
  note?: string;
};

export const staffDepartmentLabels: Record<StaffDepartment, string> = {
  housekeeping: "Housekeeping",
  maintenance: "Maintenance",
  reception: "Reception",
  restaurant: "Restaurant",
};