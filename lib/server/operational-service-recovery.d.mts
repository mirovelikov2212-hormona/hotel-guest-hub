export type OperationalServiceRecoverySignal = {
  signalId: string;
  type: "sla_breach" | "returned_request" | "critical_feedback";
  source:
    | "canonical_request_sla"
    | "canonical_request_status"
    | "canonical_guest_feedback";
  requestId: string | null;
  surveyId: string | null;
  occurredAt: string | null;
  serviceKey: string | null;
  rating: number | null;
  resolutionStatus: string | null;
  requiredAction: "human_followup";
};

export type OperationalServiceRecoveryState = {
  schemaVersion: "operational-service-recovery-v1";
  status: "clear" | "human_followup_required";
  needsHumanFollowup: boolean;
  signalCount: number;
  byType: {
    slaBreach: number;
    returnedRequest: number;
    criticalFeedback: number;
  };
  signals: readonly OperationalServiceRecoverySignal[];
  decisionAuthority: "human_hotel_staff";
  aiRole: "explain_verified_status_only";
  automaticGuestCommunication: false;
  automaticCompensation: false;
  automaticResolution: false;
};

export function buildOperationalServiceRecoveryState(
  input?: Record<string, unknown>,
): OperationalServiceRecoveryState;
