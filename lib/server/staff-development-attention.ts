import "server-only";

import {
  getCurrentStaffDevelopmentIdentity,
} from "@/lib/server/staff-development-identity";
import {
  getStaffDevelopmentManagerBrief,
} from "@/lib/server/staff-development-reporting";

export async function getStaffDevelopmentManagerAttentionSummary(
  hotelSlug: unknown,
) {
  const identity = await getCurrentStaffDevelopmentIdentity(hotelSlug);
  if (!identity) {
    throw new Error("STAFF_DEVELOPMENT_IDENTITY_REQUIRED");
  }
  if (identity.staffUserRole !== "hotel_manager") {
    throw new Error("STAFF_ATTENTION_HOTEL_MANAGER_REQUIRED");
  }

  const brief = await getStaffDevelopmentManagerBrief(hotelSlug);

  return {
    reportingDay: brief.reportingDay,
    pendingHumanReviews: brief.current.pendingHumanReviews,
    overdueTrainingAssignments: brief.current.overdueTrainingAssignments,
    hrRuleFindings: brief.current.hrRuleFindings,
    notificationCandidates: brief.notificationCandidates.length,
    hasAttention: brief.attentionItems.length > 0,
    decisionAuthority: "human_manager",
  };
}
