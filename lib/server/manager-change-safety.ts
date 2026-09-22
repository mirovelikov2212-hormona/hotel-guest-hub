import "server-only";

import { resolveManagerContentChangeScope } from "@/lib/server/manager-content-changes";
import { logSystemError } from "@/lib/server/system-events";
import { sendManagerPushNotification } from "@/lib/staff-push/web-push";

export type ManagerChangeFailureKind =
  | "validation"
  | "conflict"
  | "access"
  | "not_found"
  | "system";

export type ManagerChangeFailure = {
  code: string;
  status: number;
  kind: ManagerChangeFailureKind;
  messageKey:
    | "manager_change_validation_failed"
    | "manager_change_conflict"
    | "manager_change_access_denied"
    | "manager_change_not_found"
    | "manager_change_system_failed";
  notifyPlatform: boolean;
};

function clean(value: unknown, maxLength = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function managerChangeErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const match = message.match(/(CM5_[A-Z0-9_]+)/);
  return match?.[1] || "CM5_UNEXPECTED_ERROR";
}

export function classifyManagerChangeFailure(error: unknown): ManagerChangeFailure {
  const code = managerChangeErrorCode(error);

  if (
    code.includes("SESSION_REQUIRED")
    || code.includes("HOTEL_FORBIDDEN")
    || code.includes("RUNTIME_ROLE_REQUIRED")
    || code.includes("MANAGER_SESSION_FORBIDDEN")
    || code.includes("NOT_OWNED")
  ) {
    return {
      code,
      status: 403,
      kind: "access",
      messageKey: "manager_change_access_denied",
      notifyPlatform: false,
    };
  }

  if (
    code.includes("STALE_")
    || code.includes("NOT_DRAFT")
    || code.includes("CONCURRENT_")
    || code.includes("CURRENT_LIVE_STATE_INVALID")
  ) {
    return {
      code,
      status: 409,
      kind: "conflict",
      messageKey: "manager_change_conflict",
      notifyPlatform: false,
    };
  }

  if (code.includes("NOT_FOUND")) {
    return {
      code,
      status: 404,
      kind: "not_found",
      messageKey: "manager_change_not_found",
      notifyPlatform: false,
    };
  }

  if (
    code.includes("INVALID")
    || code.includes("REQUIRED")
    || code.includes("UNSUPPORTED")
    || code.includes("DUPLICATE")
    || code.includes("OPERATIONS_REQUIRED")
    || code.includes("OPERATIONAL_AUTHORITY_MISSING")
    || code.includes("PRICE_CURRENCY_PAIR_REQUIRED")
    || code.includes("PATCH_FIELD_FORBIDDEN")
  ) {
    return {
      code,
      status: 400,
      kind: "validation",
      messageKey: "manager_change_validation_failed",
      notifyPlatform: false,
    };
  }

  return {
    code,
    status: 500,
    kind: "system",
    messageKey: "manager_change_system_failed",
    notifyPlatform: true,
  };
}

export function managerChangeFailurePayload(error: unknown) {
  const failure = classifyManagerChangeFailure(error);
  return {
    ok: false as const,
    error: failure.code,
    errorType: failure.kind,
    messageKey: failure.messageKey,
  };
}

export async function reportManagerChangeSystemFailure(input: {
  hotelSlug: unknown;
  operation: unknown;
  error: unknown;
}) {
  const failure = classifyManagerChangeFailure(input.error);
  if (!failure.notifyPlatform) return { reported: false, reason: failure.kind };

  const hotelSlug = clean(input.hotelSlug, 100).toLowerCase();
  const operation = clean(input.operation, 120) || "unknown_manager_change";

  try {
    const scope = await resolveManagerContentChangeScope(hotelSlug);

    await Promise.allSettled([
      logSystemError({
        hotelId: scope.hotelId,
        severity: "critical",
        source: "staff_hub",
        eventType: "manager_content_change_system_failure",
        message: "A Manager Hub content change failed because of an unexpected system error.",
        error: input.error,
        metadata: {
          hotelSlug: scope.hotelSlug,
          operation,
          errorCode: failure.code,
          protection: "The requested Manager change was not allowed to mutate LIVE directly.",
        },
      }),
      sendManagerPushNotification({
        hotelId: scope.hotelId,
        hotelSlug: scope.hotelSlug,
        requestId: `manager-change-system-${Date.now()}`,
        room: "SYSTEM",
        requestTitle: "Промяната не е публикувана. Екипът на GOSTAYA е уведомен.",
        notificationTitle: "GOSTAYA — проблем при промяна",
        notificationUrl: `/staff/${scope.hotelSlug}/manager`,
      }),
    ]);

    return { reported: true, hotelId: scope.hotelId };
  } catch (scopeError) {
    await logSystemError({
      severity: "critical",
      source: "staff_hub",
      eventType: "manager_content_change_system_failure",
      message: "A Manager Hub content change failed and hotel notification scope could not be resolved.",
      error: input.error,
      metadata: {
        hotelSlug: hotelSlug || null,
        operation,
        errorCode: failure.code,
        managerNotificationUnavailable: true,
        scopeError:
          scopeError instanceof Error
            ? clean(scopeError.message, 500)
            : clean(scopeError, 500),
      },
    });

    return { reported: true, hotelId: null };
  }
}
