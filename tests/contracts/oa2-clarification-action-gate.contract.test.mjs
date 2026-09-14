import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("OA2 suppresses executable AI actions while operational clarification is required", async () => {
  const guestHub = await readFile(
    new URL("../../components/GuestHub.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    guestHub,
    /const operationalStatus = String\(data\?\.operationalActionStatus \|\| ""\)\.trim\(\);/,
  );
  assert.match(
    guestHub,
    /const actions = operationalAction\s*\? \[operationalAction\]\s*:\s*operationalStatus === "clarification_required"\s*\? \[\]\s*:\s*buildAiActions\(data\?\.diagnostics\?\.matchedIds\);/s,
  );
});

test("OA2 still requires an explicit action click before the existing confirmation flow", async () => {
  const guestHub = await readFile(
    new URL("../../components/GuestHub.tsx", import.meta.url),
    "utf8",
  );

  const actionBranch = guestHub.indexOf('if (action.kind === "operational_request")');
  const handlerCall = guestHub.indexOf("handleRequestDefClick(def, action.submission.note)", actionBranch);
  const confirmationDialog = guestHub.indexOf("openRequestDialog({");
  const canonicalSubmission = guestHub.indexOf("void performGuestRequestSubmission({");

  assert.ok(actionBranch >= 0, "operational action click branch must exist");
  assert.ok(handlerCall > actionBranch, "click must enter the existing RequestDef handler");
  assert.ok(confirmationDialog >= 0, "existing confirmation dialog must remain present");
  assert.ok(canonicalSubmission > confirmationDialog, "canonical submission must remain behind confirmation");
});
