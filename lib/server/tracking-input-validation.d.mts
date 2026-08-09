export type TrackingValidationSuccess = {
  ok: true;
  value: Record<string, any>;
};

export type TrackingValidationFailure = {
  ok: false;
  status: 400 | 413;
  code:
    | "INVALID_TRACKING_BODY"
    | "TRACKING_BODY_TOO_LARGE"
    | "MISSING_TRACKING_EVENT"
    | "INVALID_TRACKING_FIELD"
    | "TRACKING_FIELD_TOO_LONG"
    | "TRACKING_NESTED_OBJECT_TOO_LARGE";
  message: string;
  field: string | null;
};

export function validateTrackingPayload(
  body: unknown,
): TrackingValidationSuccess | TrackingValidationFailure;

export function getTrackingMaxBodyChars(): number;
