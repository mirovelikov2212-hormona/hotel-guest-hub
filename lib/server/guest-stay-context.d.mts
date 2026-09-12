export type GuestStayContextAttention =
  | {
      type: "sla_breach";
      requestId: string;
      occurredAt: string | null;
      serviceKey: string | null;
    }
  | {
      type: "returned_request";
      requestId: string;
      occurredAt: string | null;
      serviceKey: string | null;
    }
  | {
      type: "critical_feedback";
      surveyId: string | null;
      occurredAt: string | null;
      rating: number;
      resolutionStatus: string | null;
    };

export type GuestStayContext = {
  version: 1;
  scope: "current_stay";
  generatedAt: string;
  stay: {
    id: string | null;
    roomNumber: string | null;
    lifecycleState: string | null;
    checkInDate: string | null;
    checkOutDate: string | null;
    effectiveCheckOutAt: string | null;
    lastSeenAt: string | null;
    isTest: boolean;
  };
  observedLanguage: string | null;
  requests: {
    total: number;
    active: number;
    completed: number;
    returned: number;
    firstResponseBreaches: number;
    activeSlaBreaches: number;
  };
  communications: {
    total: number;
    fromGuest: number;
    fromStaff: number;
    lastActivityAt: string | null;
  };
  feedback: {
    total: number;
    latestRating: number | null;
    averageRating: number | null;
    needsAttention: boolean;
    selectedCategories: Array<{ category: string; count: number }>;
  };
  bookings: {
    total: number;
    active: number;
    cancelled: number;
    upcoming: number;
  };
  observedServiceUsage: Array<{ serviceKey: string; count: number }>;
  attention: GuestStayContextAttention[];
  preferences: {
    scope: "current_stay";
    explicit: readonly unknown[];
    inferred: false;
  };
  privacy: {
    personalIdentityStored: false;
    crossStayProfile: false;
    freeTextIncluded: false;
  };
};

export function buildGuestStayContext(input?: Record<string, unknown>): GuestStayContext;
