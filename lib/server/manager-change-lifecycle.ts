import "server-only";

import {
  cancelManagerContentChangeDraft,
  confirmManagerContentChangeDraft,
  createManagerContentChangeDraft,
} from "@/lib/server/manager-content-changes";
import { activateManagerChangeCandidate } from "@/lib/server/manager-change-activation";
import { createManagerChangeCandidate } from "@/lib/server/manager-change-candidate-persistence";
import { certifyManagerChangeCandidate } from "@/lib/server/manager-change-certification";
import { prepareManagerHubContentChange } from "@/lib/server/manager-hub-content-editor";
import { persistManagerTypedContentDraft } from "@/lib/server/manager-typed-content-drafts";

const ENABLED_VALUE = "1";

export function isManagerContentLifecycleWriteEnabled() {
  return String(
    process.env.MANAGER_CONTENT_LIFECYCLE_WRITES_ENABLED || "",
  ).trim() === ENABLED_VALUE;
}

export function assertManagerContentLifecycleWriteEnabled() {
  if (!isManagerContentLifecycleWriteEnabled()) {
    throw new Error("CM5_MANAGER_LIFECYCLE_WRITES_DISABLED");
  }
}

export async function createManagerLifecycleDraft(input: {
  hotelSlug: unknown;
  scope: unknown;
}) {
  assertManagerContentLifecycleWriteEnabled();
  return createManagerContentChangeDraft({
    hotelSlug: input.hotelSlug,
    changeScope: [input.scope],
  });
}

export async function saveManagerLifecycleTypedDraft(input: {
  hotelSlug: unknown;
  changeRequestId: unknown;
  scope: unknown;
  operations?: unknown;
  department?: unknown;
  schedule?: unknown;
}) {
  assertManagerContentLifecycleWriteEnabled();

  const prepared = await prepareManagerHubContentChange({
    hotelSlug: input.hotelSlug,
    scope: input.scope,
    operations: input.operations,
    department: input.department,
    schedule: input.schedule,
  });

  const persisted = await persistManagerTypedContentDraft({
    scope: prepared.scope,
    changeRequestId: input.changeRequestId,
    actorSessionId: (
      await import("@/lib/server/manager-content-changes")
    ).resolveManagerContentChangeScope(input.hotelSlug).then((scope) => scope.sessionId),
    operations: prepared.operations,
    preview: prepared.preview,
    diff: prepared.diff,
  });

  return {
    ...persisted,
    preview: prepared.preview,
    diff: prepared.diff,
  };
}

export async function confirmManagerLifecycleDraft(input: {
  hotelSlug: unknown;
  changeRequestId: unknown;
}) {
  assertManagerContentLifecycleWriteEnabled();
  return confirmManagerContentChangeDraft(input);
}

export async function cancelManagerLifecycleDraft(input: {
  hotelSlug: unknown;
  changeRequestId: unknown;
}) {
  assertManagerContentLifecycleWriteEnabled();
  return cancelManagerContentChangeDraft(input);
}

export async function createManagerLifecycleCandidate(input: {
  hotelSlug: unknown;
  changeRequestId: unknown;
}) {
  assertManagerContentLifecycleWriteEnabled();
  return createManagerChangeCandidate(input);
}

export async function certifyManagerLifecycleCandidate(input: {
  hotelSlug: unknown;
  changeRequestId: unknown;
}) {
  assertManagerContentLifecycleWriteEnabled();
  return certifyManagerChangeCandidate(input);
}

export async function activateManagerLifecycleCandidate(input: {
  hotelSlug: unknown;
  changeRequestId: unknown;
}) {
  assertManagerContentLifecycleWriteEnabled();
  return activateManagerChangeCandidate(input);
}
