const MAX_GUEST_TEXT_CHARS = 1_000;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return clean(value).toLowerCase().replace(/\s+/g, "_").replace(/-+/g, "_");
}

function blocked(code, status = "not_applicable") {
  return { ok: false, status, code };
}

function isExecutableRequestDef(def) {
  return Boolean(
    def &&
      typeof def === "object" &&
      normalizeKey(def.type || "request") === "request" &&
      def.enabled === true &&
      def.guestVisible === true &&
      def.aiVisible === true &&
      normalizeKey(def.requestKind) !== "info_only",
  );
}

export function resolveOperationalActionExecutionBridge(input) {
  if (clean(input?.operationalActionStatus) !== "confirmation_required") {
    return blocked("OPERATIONAL_CONFIRMATION_NOT_REQUIRED");
  }

  const action = input?.operationalAction;
  if (
    !action ||
    action.kind !== "guest_request" ||
    action.executionMode !== "confirmation_required" ||
    action.requiresGuestConfirmation !== true ||
    action.authority !== "hotel_request_def"
  ) {
    return blocked("OPERATIONAL_PLAN_INVALID");
  }

  const sourceRequestDef = clean(action.sourceRequestDef);
  if (!sourceRequestDef) {
    return blocked("OPERATIONAL_REQUEST_DEF_MISSING");
  }

  const catalogRecordId = clean(action.catalogRecordId);
  if (catalogRecordId !== `service:${sourceRequestDef}`) {
    return blocked("OPERATIONAL_SERVICE_LOCATOR_MISMATCH");
  }

  const requestDefs = Array.isArray(input?.requestDefs) ? input.requestDefs : [];
  const def = requestDefs.find((candidate) => clean(candidate?.id) === sourceRequestDef);
  if (!isExecutableRequestDef(def)) {
    return blocked("OPERATIONAL_REQUEST_DEF_NOT_EXECUTABLE");
  }

  const requestType = normalizeKey(def.requestType || def.id);
  if (!requestType || normalizeKey(action.requestType) !== requestType) {
    return blocked("OPERATIONAL_REQUEST_TYPE_MISMATCH");
  }

  const guestText = clean(input?.guestText);
  if (!guestText) {
    return blocked("OPERATIONAL_GUEST_TEXT_MISSING", "clarification_required");
  }
  if (guestText.length > MAX_GUEST_TEXT_CHARS) {
    return blocked("OPERATIONAL_GUEST_TEXT_TOO_LONG", "clarification_required");
  }

  const requestKind = normalizeKey(def.requestKind);
  const defIdKey = normalizeKey(def.id);
  const requiresGuidedFlow = Boolean(
    requestKind === "selection" ||
      requestKind === "quantity" ||
      def.requiresQuantity === true ||
      defIdKey === "massage_booking" ||
      requestType === "massage_booking",
  );

  if (requiresGuidedFlow) {
    return {
      ok: true,
      status: "confirmation_required",
      mode: "guided_request_def",
      catalogRecordId,
      sourceRequestDef,
      requestType,
    };
  }

  return {
    ok: true,
    status: "confirmation_required",
    mode: "direct_confirmation",
    catalogRecordId,
    sourceRequestDef,
    requestType,
    submission: {
      type: requestType,
      sourceRequestDef,
      note: guestText,
    },
  };
}
