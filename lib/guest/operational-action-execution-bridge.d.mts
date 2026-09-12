export type OperationalExecutionSubmission = {
  type: string;
  sourceRequestDef: string;
  note: string;
};

export type OperationalActionExecutionBridge =
  | {
      ok: true;
      status: "confirmation_required";
      mode: "direct_confirmation";
      catalogRecordId: string;
      sourceRequestDef: string;
      requestType: string;
      submission: OperationalExecutionSubmission;
    }
  | {
      ok: true;
      status: "confirmation_required";
      mode: "guided_request_def";
      catalogRecordId: string;
      sourceRequestDef: string;
      requestType: string;
    }
  | {
      ok: false;
      status: "not_applicable" | "clarification_required";
      code: string;
    };

export function resolveOperationalActionExecutionBridge(input: {
  operationalActionStatus?: unknown;
  operationalAction?: Record<string, any> | null;
  requestDefs?: Array<Record<string, any>>;
  guestText?: unknown;
}): OperationalActionExecutionBridge;
