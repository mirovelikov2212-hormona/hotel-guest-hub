import { NextRequest, NextResponse } from "next/server";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import { resolveGenericDepartmentStaffScope } from "@/lib/server/generic-department-staff-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const ALLOWED_STATUSES = new Set(["new", "in_progress", "completed", "returned"]);

export async function POST(req: NextRequest) {
  try {
    const originError = enforceStaffSameOrigin(req);
    if (originError) return originError;

    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toLowerCase();
    const requestId = String(body?.requestId || body?.id || "").trim();
    const status = String(body?.status || "").trim().toLowerCase();

    if (!hotelSlug || !role || !requestId || !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid payload" },
        { status: 400 },
      );
    }

    const scope = await resolveGenericDepartmentStaffScope(hotelSlug, role);
    if (!scope) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized department runtime" },
        { status: 401 },
      );
    }

    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from("guest_requests")
      .select("id, status, metadata_json")
      .eq("id", requestId)
      .eq("hotel_id", scope.hotelId)
      .maybeSingle();

    if (requestError || !requestRow) {
      return NextResponse.json(
        { ok: false, error: "Request not found" },
        { status: 404 },
      );
    }

    const metadata = (requestRow.metadata_json || {}) as Record<string, unknown>;
    if (String(metadata.department || "") !== scope.departmentCode) {
      return NextResponse.json(
        { ok: false, error: "Request is outside this department scope" },
        { status: 403 },
      );
    }

    if (String(requestRow.status) === status) {
      return NextResponse.json({ ok: true, noop: true });
    }

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = { status };
    if (status === "in_progress") payload.started_at = now;
    if (status === "completed") {
      payload.resolved_at = now;
      payload.closed_at = now;
    }

    const { error: updateError } = await supabaseAdmin
      .from("guest_requests")
      .update(payload)
      .eq("id", requestId)
      .eq("hotel_id", scope.hotelId);

    if (updateError) {
      console.error("generic department request status update failed", {
        hotelId: scope.hotelId,
        requestId,
        role: scope.role,
        status,
        updateError,
      });
      return NextResponse.json(
        { ok: false, error: "Request update failed" },
        { status: 503 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("generic department request-status POST error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500 },
    );
  }
}
