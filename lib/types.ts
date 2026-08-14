export type LangKey = "bg" | "en" | "de" | "ro" | "cs" | "ru" | "tr" | string;

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

export type RequestDefType = "request" | "info" | "policy" | "pdf" | "external_link" | "link";

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
  /** Runtime after-hours target supplied by normalized M10.4 routing authority. */
  afterHoursDepartment?: StaffDepartment | "none" | string;
  requestType?: StaffRequestType | string;
  requiresNote: boolean;
  requiresQuantity: boolean;
  minQty?: number;
  maxQty?: number;
  requiresTime: boolean;
  timeMode: RequestDefTimeMode;
  options: string[];
  optionsByLang?: Partial<Record<LangKey, string[]>>;
  /** Optional image URL per option, matched by position with options/optionsByLang. */
  optionImageUrls?: string[];
  /** Optional description/info per option, matched by position with options/optionsByLang. */
  optionInfoByLang?: Partial<Record<LangKey, string[]>>;
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
  section?: string;
  subsection?: string;
  sectionTitle?: RequestDefTextMap;
  pdfUrl?: string;
  externalUrl?: string;
  linkUrl?: string;
  price?: string;
  currency?: string;
  requiresBilling?: boolean;
  notifyDepartments?: string[];
  keywords: string[];
  aliasesByLang?: Partial<Record<LangKey, string[]>>;
  intentTags?: string[];
  uiSectionId?: string;
  canonicalRef?: string;
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
  email?: string;
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
  booking?: string;
};

export type SocialLinks = {
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
};

export type HotelRoom = {
  roomNumber: string;
  floor?: string;
  building?: string;
  roomType?: string;
  active?: boolean;
};

export type VenueRow = {
  id?: string;
  category?: string;
  type?: string;
  name: string;
  nameByLang?: Partial<Record<LangKey, string>>;
  active?: boolean;
  aiVisible?: boolean;
  aliasesByLang?: Partial<Record<LangKey, string[]>>;
  intentTags?: string[];
  uiSectionId?: string;
  sortOrder?: number | string;
  icon?: string;

  shortDescription?: string;
  shortDescriptionByLang?: Partial<Record<LangKey, string>>;
  description?: string;
  descriptionByLang?: Partial<Record<LangKey, string>>;
  cuisine?: string;
  cuisineByLang?: Partial<Record<LangKey, string>>;
  hours?: string;
  hoursByLang?: Partial<Record<LangKey, string>>;
  open?: string;
  close?: string;
  menuUrl?: string;
  location?: string;
  locationByLang?: Partial<Record<LangKey, string>>;

  requiresReservation?: boolean;

  reservationType?: "whatsapp" | "phone" | "url" | "email" | "request" | "staff" | "none";
  reservationDepartment?: "reception" | "restaurant" | string;
  reservationUrl?: string;
  reservationPhone?: string;
  reservationWhatsapp?: string;
  reservationEmail?: string;
  reservationLabel?: string;
  reservationLabelByLang?: Partial<Record<LangKey, string>>;
  reservationMessage?: string;
  reservationMessageByLang?: Partial<Record<LangKey, string>>;
  reservationAskOccasion?: boolean;
  reservationHours?: string;

  programUrl?: string;
  programText?: string;
  programTextByLang?: Partial<Record<LangKey, string>>;
  ageGroup?: string;
  ageGroupByLang?: Partial<Record<LangKey, string>>;

  whatsapp?: string;
  phone?: string;
};

export type HotelInfoItem = {
  key: string;
  category?: string;
  sortOrder?: number;
  icon?: string;
  active?: boolean;
  aiVisible?: boolean;
  aliasesByLang?: Partial<Record<LangKey, string[]>>;
  intentTags?: string[];
  uiSectionId?: string;
  linkUrl?: string;
  canonicalRef?: string;
  title: RequestDefTextMap;
  text: RequestDefTextMap;
};

export type HotelConfig = {
  hotelId?: string;
  hotelSlug?: string;
  publicSlug?: string;
  isSandbox?: boolean;
  productionHotelId?: string | null;
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
    lat?: number;
    lng?: number;
    latitude?: number;
    longitude?: number;
    lon?: number;
  };

  hotelLatitude?: number;
  hotelLongitude?: number;
  hotelTimezone?: string;
  geoGuardEnabled?: boolean;
  geoGuardRadiusMeters?: number;
  testModeEnabled?: boolean;
  rawConfig?: Record<string, string>;

  theme?: {
    /** Section headers / primary brand block color. */
    primary?: string;
    /** Main action color. */
    secondary?: string;
    /** Accent / focus color. */
    accent?: string;
    /** Main app background color. */
    background?: string;
    /** Main text color. */
    text?: string;
    /** Muted secondary text color. */
    muted?: string;
    /** Soft highlight color, e.g. subtle borders/badges. */
    soft?: string;
    /** Dark card/surface color used inside the hub. */
    surface?: string;
  };

  contacts: {
    reception: ContactInfo;
    housekeeping: ContactInfo;
    maintenance: ContactInfo;
    restaurant: ContactInfo;
    events: ContactInfo;
  };

  departmentHours?: DepartmentHours;
  /** Runtime-only marker; never persisted into an M9 configuration snapshot. */
  departmentRoutingRuntimeActivated?: boolean;
  housekeepingCutoff?: string;

  housekeepingExtras?: Array<{
    key: string;
    labelKey: string;
    messageKey: string;
  }>;

  taxiProviders?: TaxiProvider[];
  reviews: ReviewLinks;
  socialLinks?: SocialLinks;

  venueRows?: VenueRow[];
  hotelInfoItems?: HotelInfoItem[];
  requestDefs?: RequestDef[];

  /** Active hotel rooms loaded from the optional ROOMS Google Sheet tab. */
  hotelRooms?: HotelRoom[];
  /** Convenience list for fast validation in GuestHub and API routes. */
  validRoomNumbers?: string[];
  /** Active test rooms whose guest stay may use the controlled test-room flow. */
  testRoomNumbers?: string[];
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
  | "massage_booking"
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
