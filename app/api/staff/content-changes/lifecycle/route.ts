import { NextRequest, NextResponse } from "next/server";

import {
  activateManagerLifecycleCandidate,
  cancelManagerLifecycleDraft,
  certifyManagerLifecycleCandidate,
  confirmManagerLifecycleDraft,
  createManagerLifecycleCandidate,
  createManagerLifecycleDraft,
  isManagerContentLifecycleWriteEnabled,
  saveManagerLifecycleTypedDraft,
} from "@/lib/server/manager-change-lifecycle";
import {
  classifyManagerChangeFailure,
  managerChangeFailurePayload,
  reportManagerChangeSystemFailure,
} from "@/lib/server/manager-change-safety";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function disabledResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "CM5_MANAGER_LIFECYCLE_WRITES_DISABLED",
      errorType: "disabled",
      messageKey: "manager_change_lifecycle_disabled",
    },
    { status: 503, headers: NO_STORE_HEADERS },
  );
}

function failure(error: unknown) {
  const classified = classifyManagerChangeFailure(error);
  return NextResponse.json(
    managerChangeFailurePayload(error),
    { status: classified.status, headers: NO_STORE_HEADERS },
  );
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      writesEnabled: isManagerContentLifecycleWriteEnabled(),
      lifecycle: [
        "draft",
        "confirmed",
        "candidate_created",
        "certified",
        "live",
      ],
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  if (!isManagerContentLifecycleWriteEnabled()) {
    return disabledResponse();
  }

  let hotelSlug = "";
  let action = "unknown";

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "CM5_BODY_REQUIRED" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    hotelSlug = String(body.hotelSlug || "").trim().toLowerCase();
    action = String(body.action || "").trim().toLowerCase();

    if (action === "create_draft") {
      const result = await createManagerLifecycleDraft({
        hotelSlug,
        scope: body.scope,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "save_draft") {
      const result = await saveManagerLifecycleTypedDraft({
        hotelSlug,
        changeRequestId: body.changeRequestId,
        scope: body.scope,
        operations: body.operations,
        department: body.department,
        schedule: body.schedule,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "confirm") {
      const result = await confirmManagerLifecycleDraft({
        hotelSlug,
        changeRequestId: body.changeRequestId,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "cancel") {
      const result = await cancelManagerLifecycleDraft({
        hotelSlug,
        changeRequestId: body.changeRequestId,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "create_candidate") {
      const result = await createManagerLifecycleCandidate({
        hotelSlug,
        changeRequestId: body.changeRequestId,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "certify") {
      const result = await certifyManagerLifecycleCandidate({
        hotelSlug,
        changeRequestId: body.changeRequestId,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "activate") {
      const result = await activateManagerLifecycleCandidate({
        hotelSlug,
        changeRequestId: body.changeRequestId,
      });
      return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
    }

    return NextResponse.json(
      { ok: false, error: "CM5_LIFECYCLE_ACTION_INVALID" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("manager content lifecycle POST failed", error);
    if (classifyManagerChangeFailure(error).notifyPlatform) {
      await reportManagerChangeSystemFailure({
        hotelSlug,
        operation: `manager_change_lifecycle:${action}`,
        error,
      });
    }
    return failure(error);
  }
}
