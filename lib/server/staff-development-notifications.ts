import "server-only";

import {
  assertStaffDevelopmentWriteEnabled,
} from "@/lib/server/staff-development-persistence";
import {
  requireStaffDevelopmentIdentity,
} from "@/lib/server/staff-development-identity";
import {
  getStaffDevelopmentManagerBrief,
} from "@/lib/server/staff-development-reporting";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import {
  sendManagerPushNotification,
} from "@/lib/staff-push/web-push";

function clean(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function deliverStaffDevelopmentManagerBriefNotification(
  hotelSlugInput: unknown,
) {
  const hotelSlug = clean(hotelSlugInput);
  if (!hotelSlug) {
    throw new Error("STAFF_REPORTING_HOTEL_REQUIRED");
  }

  const identity = await requireStaffDevelopmentIdentity(hotelSlug);
  if (identity.staffUserRole !== "hotel_manager") {
    throw new Error("STAFF_REPORTING_HOTEL_MANAGER_REQUIRED");
  }

  assertStaffDevelopmentWriteEnabled();

  const [hotel, brief] = await Promise.all([
    resolveHotelByAnySlugAdmin(hotelSlug),
    getStaffDevelopmentManagerBrief(hotelSlug),
  ]);

  if (!hotel?.id || String(hotel.id) !== String(identity.hotelId)) {
    throw new Error("STAFF_REPORTING_HOTEL_SCOPE_MISMATCH");
  }

  if (!brief.notificationCandidates.length) {
    return {
      delivered: false,
      skipped: true,
      reason: "no_notification_candidates",
      reportingDay: brief.reportingDay,
      candidateCount: 0,
    };
  }

  const pending = brief.current.pendingHumanReviews;
  const overdue = brief.current.overdueTrainingAssignments;
  const hrFindings = brief.current.hrRuleFindings;
  const candidateCount = brief.notificationCandidates.length;

  const body = [
    `${candidateCount} Staff Development item${candidateCount === 1 ? "" : "s"} need attention.`,
    `Reviews: ${pending}.`,
    `Overdue training: ${overdue}.`,
    `HR findings: ${hrFindings}.`,
  ].join(" ");

  const requestId = `staff-development-brief-${brief.reportingDay}`;
  const result = await sendManagerPushNotification({
    hotelId: String(hotel.id),
    hotelSlug: String(hotel.slug),
    requestId,
    room: "",
    requestTitle: "",
    notificationTitle: "StayHub — Staff Development Morning Brief",
    notificationBody: body,
    notificationUrl:
      `/staff/${hotel.slug}/manager/development?source=staff-development-brief&day=${encodeURIComponent(brief.reportingDay)}`,
  });

  return {
    delivered: result.sent > 0,
    skipped: result.skipped,
    reportingDay: brief.reportingDay,
    candidateCount,
    result,
  };
}
