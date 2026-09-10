from pathlib import Path

path = Path('components/GuestHub.tsx')
text = path.read_text()

def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    text = text.replace(old, new, 1)

replace_once(
    'import { deriveGuestRuntimeCapabilities } from "@/lib/guest/guest-runtime-capabilities.mjs";\n',
    'import { deriveGuestRuntimeCapabilities } from "@/lib/guest/guest-runtime-capabilities.mjs";\nimport { resolveOperationalActionExecutionBridge } from "@/lib/guest/operational-action-execution-bridge.mjs";\n',
    'import',
)

replace_once(
'''type AiChatAction = {
  kind: "request_def" | "venue";
  targetId: string;
  matchedId: string;
  label: string;
};''',
'''type AiChatAction = {
  kind: "request_def" | "venue" | "operational_request";
  targetId: string;
  matchedId: string;
  label: string;
  submission?: {
    type: string;
    sourceRequestDef: string;
    note?: string;
  };
};''',
    'AiChatAction',
)

replace_once(
'''  function handleRequestDefClick(def: RequestDef) {
    const infoMessage = getRequestDefMessage(def);''',
'''  function handleRequestDefClick(def: RequestDef, initialNote?: string) {
    const infoMessage = getRequestDefMessage(def);''',
    'handler signature',
)

replace_once(
'''    const continueSubmit = () => {
      const note = buildRequestDefNote(def, infoMessage);
      if (note === null) return;

      submitGuestRequest({
        type: String(def.requestType || def.id),
        typeLabel: title,
        note: note || undefined,''',
'''    const continueSubmit = () => {
      const configuredNote = buildRequestDefNote(def, infoMessage);
      if (configuredNote === null) return;

      const note = [String(initialNote || "").trim(), String(configuredNote || "").trim()]
        .filter(Boolean)
        .join("\\n");

      submitGuestRequest({
        type: String(def.requestType || def.id),
        typeLabel: title,
        note: note || undefined,''',
    'merge note',
)

replace_once(
'''    const sourceRequestDefKey = String(input.sourceRequestDef || "").trim().toLowerCase();
    const sourceRequestDef = sourceRequestDefKey
      ? requestDefs.find((def) => String(def.id || "").trim().toLowerCase() === sourceRequestDefKey)
      : undefined;
    const requestDefLabel = sourceRequestDef ? getRequestDefTitle(sourceRequestDef) : "";''',
'''    const sourceRequestDefId = String(input.sourceRequestDef || "").trim();
    const sourceRequestDef = sourceRequestDefId
      ? requestDefs.find((def) => String(def.id || "").trim() === sourceRequestDefId)
      : undefined;
    const sourceRequestDefKey = String(sourceRequestDef?.id || sourceRequestDefId).trim().toLowerCase();
    const requestDefLabel = sourceRequestDef ? getRequestDefTitle(sourceRequestDef) : "";''',
    'opaque confirmation lookup',
)

builder = '''  function buildAiOperationalAction(data: any, guestText: string): AiChatAction | null {
    const bridge = resolveOperationalActionExecutionBridge({
      operationalActionStatus: data?.operationalActionStatus,
      operationalAction: data?.operationalAction,
      requestDefs,
      guestText,
    });

    if (!bridge.ok) return null;

    const def = requestDefs.find(
      (item) => String(item.id || "").trim() === bridge.sourceRequestDef
    );
    if (!def) return null;

    const title = getRequestDefTitle(def) || bridge.sourceRequestDef.replace(/_/g, " ");
    const normalizedId = bridge.sourceRequestDef.toLowerCase();
    const verb =
      normalizedId.includes("massage")
        ? aiActionCopy.reserve
        : def.requestKind === "selection"
          ? aiActionCopy.choose
          : def.requestKind === "quantity" || def.requiresQuantity
            ? aiActionCopy.order
            : aiActionCopy.request;

    if (bridge.mode === "guided_request_def") {
      return {
        kind: "request_def",
        targetId: bridge.sourceRequestDef,
        matchedId: bridge.catalogRecordId,
        label: `${verb} ${title}`.trim(),
      };
    }

    return {
      kind: "operational_request",
      targetId: bridge.sourceRequestDef,
      matchedId: bridge.catalogRecordId,
      label: `${verb} ${title}`.trim(),
      submission: bridge.submission,
    };
  }

'''
replace_once(
    '  function buildAiActions(matchedIds: unknown): AiChatAction[] {\n',
    builder + '  function buildAiActions(matchedIds: unknown): AiChatAction[] {\n',
    'builder',
)

replace_once(
'''    window.setTimeout(() => {
      if (action.kind === "request_def") {''',
'''    window.setTimeout(() => {
      if (action.kind === "operational_request") {
        if (!action.submission) return;

        const def = requestDefs.find(
          (item) => String(item.id || "").trim() === action.submission?.sourceRequestDef
        );
        if (
          !def ||
          def.type !== "request" ||
          def.enabled !== true ||
          def.guestVisible !== true ||
          def.aiVisible !== true ||
          String(def.requestKind || "").trim().toLowerCase() === "info_only"
        ) {
          return;
        }

        handleRequestDefClick(def, action.submission.note);
        return;
      }

      if (action.kind === "request_def") {''',
    'click bridge',
)

replace_once(
'''      const answerText = String(data.answer || tUI("ai_no_info") || "Все още нямам тази информация за хотела.");
      const actions = buildAiActions(data?.diagnostics?.matchedIds);''',
'''      const answerText = String(data.answer || tUI("ai_no_info") || "Все още нямам тази информация за хотела.");
      const operationalAction = buildAiOperationalAction(data, questionText);
      const actions = operationalAction
        ? [operationalAction]
        : buildAiActions(data?.diagnostics?.matchedIds);''',
    'response wiring',
)

path.write_text(text)
print('OA2 GuestHub patch applied')
