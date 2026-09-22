import { NextRequest, NextResponse } from "next/server";

import {
  classifyManagerChangeFailure,
  managerChangeFailurePayload,
  reportManagerChangeSystemFailure,
} from "@/lib/server/manager-change-safety";
import {
  getManagerHubContentEditorState,
  previewManagerHubContentChange,
} from "@/lib/server/manager-hub-content-editor";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  const classified = classifyManagerChangeFailure(error);
  return NextResponse.json(
    managerChangeFailurePayload(error),
    { status: classified.status },
  );
}

export async function GET(req: NextRequest) {
  const hotelSlug = String(
    req.nextUrl.searchParams.get("hotelSlug") || "",
  ).trim().toLowerCase();

  try {
    const editor = await getManagerHubContentEditorState(hotelSlug);
    return NextResponse.json({ ok: true, editor });
  } catch (error) {
    console.error("manager Hub content editor GET failed", error);
    if (classifyManagerChangeFailure(error).notifyPlatform) {
      await reportManagerChangeSystemFailure({
        hotelSlug,
        operation: "hub_content_editor_load",
        error,
      });
    }
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  let hotelSlug = "";
  let scope = "";
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "CM5_BODY_REQUIRED" },
        { status: 400 },
      );
    }

    hotelSlug = String(body.hotelSlug || "").trim().toLowerCase();
    scope = String(body.scope || "").trim().toLowerCase();

    const result = await previewManagerHubContentChange({
      hotelSlug,
      scope,
      operations: body.operations,
      department: body.department,
      schedule: body.schedule,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("manager Hub content editor POST failed", error);
    if (classifyManagerChangeFailure(error).notifyPlatform) {
      await reportManagerChangeSystemFailure({
        hotelSlug,
        operation: `hub_content_preview:${scope || "unknown"}`,
        error,
      });
    }
    return failure(error);
  }
}
