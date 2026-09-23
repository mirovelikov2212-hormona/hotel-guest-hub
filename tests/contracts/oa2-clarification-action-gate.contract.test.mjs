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
  const actionsStart = guestHub.indexOf("const actions = (");
  const clarificationGate = guestHub.indexOf(
    'operationalStatus === "clarification_required"',
    actionsStart,
  );
  const fallbackActions = guestHub.indexOf(
    "buildAiActions(data?.diagnostics?.matchedIds)",
    clarificationGate,
  );
  const lineageMap = guestHub.indexOf(
    "interactionId: aiInteractionId",
    fallbackActions,
  );

  assert.ok(actionsStart >= 0, "operational action selection must exist");
  assert.ok(
    clarificationGate > actionsStart,
    "clarification must gate executable actions",
  );
  assert.ok(
    fallbackActions > clarificationGate,
    "catalog actions must remain behind clarification gate",
  );
  assert.ok(
    lineageMap > fallbackActions,
    "AI action lineage must be attached after gated selection",
  );
});

test("OA2 still requires an explicit action click before the existing confirmation flow", async () => {
  const guestHub = await readFile(
    new URL("../../components/GuestHub.tsx", import.meta.url),
    "utf8",
  );

  const actionBranch = guestHub.indexOf('if (action.kind === "operational_request")');
  const handlerSource = actionBranch >= 0 ? guestHub.slice(actionBranch) : "";
  const handlerCall = /handleRequestDefClick\([\s\S]*?def,[\s\S]*?action\.submission\.note,[\s\S]*?action\.interactionId,[\s\S]*?\);/.test(
    handlerSource,
  );
  const confirmationDialog = guestHub.indexOf("openRequestDialog({");
  const canonicalSubmission = guestHub.indexOf("void performGuestRequestSubmission({");

  assert.ok(actionBranch >= 0, "operational action click branch must exist");
  assert.equal(
    handlerCall,
    true,
    "click must enter the existing RequestDef handler with AI lineage",
  );
  assert.ok(confirmationDialog >= 0, "existing confirmation dialog must remain present");
  assert.ok(canonicalSubmission > confirmationDialog, "canonical submission must remain behind confirmation");
});
