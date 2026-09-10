export type OperationalWorkflowAction = {
  kind: "guest_request";
  executionMode: "confirmation_required";
  requiresGuestConfirmation: true;
  authority: "hotel_request_def";
  catalogRecordId: string;
  sourceRequestDef: string;
  requestType: string;
  primaryDepartment: string;
  effectiveDepartment: string;
  afterHoursDepartment: string | null;
  afterHoursApplied: boolean;
  workingHoursKnown: boolean;
  notifyDepartments: string[];
  requiresBilling: boolean;
  price: unknown;
  currency: unknown;
  quantity: unknown;
};

export type OperationalWorkflowResolution =
  | {
      ok: true;
      status: "confirmation_required";
      action: OperationalWorkflowAction;
    }
  | {
      ok: false;
      status: "not_applicable" | "clarification_required";
      code: string;
    };

export function resolveOperationalWorkflow(input: {
  routerResult: {
    status?: string;
    selected_ids?: unknown[];
    requested_fields?: unknown[];
    confidence?: number;
  };
  catalog: { records?: Array<Record<string, unknown>> };
  hotelConfig: Record<string, any>;
  guestText?: string;
  now?: Date;
  minConfidence?: number;
}): OperationalWorkflowResolution;
