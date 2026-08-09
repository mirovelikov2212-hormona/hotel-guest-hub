export type ValidGuestRequestCreatePayload = {
  hotelSlug: string;
  room: string;
  rawType: string;
  typeLabel: string;
  note: string | null;
  serviceTime: "now" | "today" | "tomorrow";
  requestedSourceRequestDef: string | null;
  guestLanguage: string;
  stayId: string;
  stayDeviceId: string;
  lateCheckoutRequestedTime: string | null;
};

export type GuestRequestCreateValidationResult =
  | {
      ok: true;
      value: ValidGuestRequestCreatePayload;
    }
  | {
      ok: false;
      status: 400 | 413;
      code:
        | "INVALID_REQUEST_BODY"
        | "REQUEST_BODY_TOO_LARGE"
        | "MISSING_REQUIRED_FIELD"
        | "INVALID_REQUEST_FIELD"
        | "REQUEST_FIELD_TOO_LONG";
      message: string;
      field: string | null;
    };

export function validateGuestRequestCreatePayload(
  body: unknown,
): GuestRequestCreateValidationResult;

export function getGuestRequestCreateMaxBodyChars(): number;
