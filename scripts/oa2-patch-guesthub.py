from pathlib import Path

path = Path("components/GuestHub.tsx")
text = path.read_text()

old = '''      const operationalAction = buildAiOperationalAction(data, questionText);
      const actions = operationalAction
        ? [operationalAction]
        : buildAiActions(data?.diagnostics?.matchedIds);'''
new = '''      const operationalAction = buildAiOperationalAction(data, questionText);
      const operationalStatus = String(data?.operationalActionStatus || "").trim();
      const actions = operationalAction
        ? [operationalAction]
        : operationalStatus === "clarification_required"
          ? []
          : buildAiActions(data?.diagnostics?.matchedIds);'''

count = text.count(old)
if count != 1:
    raise SystemExit(f"clarification gate: expected 1 match, found {count}")

path.write_text(text.replace(old, new, 1))
print("OA2 clarification action gate applied")
