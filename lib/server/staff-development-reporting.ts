import "server-only";

import { buildStaffDevelopmentManagerBrief } from "@/lib/staff-development/staff-development-reporting-model.mjs";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { getManagerStaffDevelopmentState } from "@/lib/server/staff-development-read";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { requireHotelProductModuleAccess } from "@/lib/server/product-module-entitlements";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function ids(values: unknown[]) {
  return [...new Set(values.map((value) => clean(value)).filter(Boolean))];
}

export async function getStaffDevelopmentManagerBrief(
  hotelSlug: unknown,
  generatedAt: Date = new Date(),
) {
  const [state, hotel] = await Promise.all([
    getManagerStaffDevelopmentState(hotelSlug),
    resolveHotelByAnySlugAdmin(clean(hotelSlug)),
  ]);

  if (!hotel?.id || String(hotel.id) !== String(state.identity.hotelId)) {
    throw new Error("STAFF_REPORTING_HOTEL_SCOPE_MISMATCH");
  }

  await requireHotelProductModuleAccess(
    state.identity.hotelId,
    "manager_intelligence",
  );

  const assignmentIds = ids(
    (state.assignments || []).map((row: Record<string, unknown>) => row.id),
  );

  let completions: Array<Record<string, unknown>> = [];
  let assessmentAttempts: Array<Record<string, unknown>> = [];

  if (assignmentIds.length) {
    const [completionResult, attemptResult] = await Promise.all([
      supabaseAdmin
        .from("staff_training_completions")
        .select(
          "id,hotel_id,assignment_id,staff_user_id,completion_hash,completed_at",
        )
        .eq("hotel_id", state.identity.hotelId)
        .in("assignment_id", assignmentIds)
        .order("completed_at", { ascending: false }),
      supabaseAdmin
        .from("staff_assessment_attempts")
        .select(
          "id,hotel_id,staff_user_id,training_assignment_id,assessment_revision_id,attempt_no,attempt_status,result_hash,submitted_at",
        )
        .eq("hotel_id", state.identity.hotelId)
        .in("training_assignment_id", assignmentIds)
        .order("submitted_at", { ascending: false }),
    ]);

    if (completionResult.error) {
      throw new Error("STAFF_REPORTING_COMPLETIONS_READ_FAILED");
    }
    if (attemptResult.error) {
      throw new Error("STAFF_REPORTING_ATTEMPTS_READ_FAILED");
    }

    completions =
      (completionResult.data || []) as Array<Record<string, unknown>>;
    assessmentAttempts =
      (attemptResult.data || []) as Array<Record<string, unknown>>;
  }

  return buildStaffDevelopmentManagerBrief({
    hotelId: state.identity.hotelId,
    timeZone: hotel.timezone || "UTC",
    generatedAt: generatedAt.toISOString(),
    staff: state.staff,
    assignments: state.assignments,
    completions,
    assessmentAttempts,
    pendingReviews: state.pendingReviews,
    verifiedResults: state.verifiedResults,
    hrEvaluations: state.hrEvaluations,
  });
}
