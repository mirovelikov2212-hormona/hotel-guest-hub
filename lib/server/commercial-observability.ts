import "server-only";

import type { ControlPlaneProperty } from "@/lib/server/control-plane-registry";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type CommercialAttentionLevel =
  | "expired"
  | "one_day"
  | "three_days"
  | "seven_days"
  | "pending"
  | "suspended";

export type CommercialAttentionItem = {
  propertyId: string;
  displayName: string;
  level: CommercialAttentionLevel;
  effectiveStatus: ControlPlaneProperty["commercial"]["effectiveStatus"];
  trialEndsAt: string | null;
  daysRemaining: number | null;
};

export type CommercialTimelineEvent = {
  id: string;
  propertyId: string;
  displayName: string;
  action: string;
  previousStatus: string | null;
  newStatus: string;
  planCode: string | null;
  trialEndsAt: string | null;
  reason: string;
  createdAt: string;
};

export type CommercialObservabilitySnapshot = {
  attention: CommercialAttentionItem[];
  attentionCount: number;
  expiredCount: number;
  dueWithinOneDayCount: number;
  dueWithinThreeDaysCount: number;
  dueWithinSevenDaysCount: number;
  pendingCount: number;
  suspendedCount: number;
  recentEvents: CommercialTimelineEvent[];
  generatedAt: string;
};

type LifecycleEventRow = {
  id: string;
  property_id: string;
  action: string;
  previous_status: string | null;
  new_status: string;
  plan_code: string | null;
  trial_ends_at: string | null;
  reason: string;
  created_at: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function classifyAttention(
  property: ControlPlaneProperty,
  nowMs: number,
): CommercialAttentionItem | null {
  const effectiveStatus = property.commercial.effectiveStatus;

  if (effectiveStatus === "trial_expired") {
    return {
      propertyId: property.id,
      displayName: property.displayName,
      level: "expired",
      effectiveStatus,
      trialEndsAt: property.commercial.trialEndsAt,
      daysRemaining: 0,
    };
  }

  if (effectiveStatus === "pending") {
    return {
      propertyId: property.id,
      displayName: property.displayName,
      level: "pending",
      effectiveStatus,
      trialEndsAt: null,
      daysRemaining: null,
    };
  }

  if (effectiveStatus === "suspended") {
    return {
      propertyId: property.id,
      displayName: property.displayName,
      level: "suspended",
      effectiveStatus,
      trialEndsAt: property.commercial.trialEndsAt,
      daysRemaining: null,
    };
  }

  if (effectiveStatus !== "trial_active" || !property.commercial.trialEndsAt) return null;

  const trialEndMs = Date.parse(property.commercial.trialEndsAt);
  if (!Number.isFinite(trialEndMs)) return null;

  const remainingMs = trialEndMs - nowMs;
  if (remainingMs <= 0) {
    return {
      propertyId: property.id,
      displayName: property.displayName,
      level: "expired",
      effectiveStatus: "trial_expired",
      trialEndsAt: property.commercial.trialEndsAt,
      daysRemaining: 0,
    };
  }

  const daysRemaining = Math.ceil(remainingMs / DAY_MS);
  if (remainingMs <= DAY_MS) {
    return {
      propertyId: property.id,
      displayName: property.displayName,
      level: "one_day",
      effectiveStatus,
      trialEndsAt: property.commercial.trialEndsAt,
      daysRemaining,
    };
  }
  if (remainingMs <= 3 * DAY_MS) {
    return {
      propertyId: property.id,
      displayName: property.displayName,
      level: "three_days",
      effectiveStatus,
      trialEndsAt: property.commercial.trialEndsAt,
      daysRemaining,
    };
  }
  if (remainingMs <= 7 * DAY_MS) {
    return {
      propertyId: property.id,
      displayName: property.displayName,
      level: "seven_days",
      effectiveStatus,
      trialEndsAt: property.commercial.trialEndsAt,
      daysRemaining,
    };
  }
  return null;
}

const ATTENTION_PRIORITY: Record<CommercialAttentionLevel, number> = {
  expired: 0,
  one_day: 1,
  three_days: 2,
  seven_days: 3,
  pending: 4,
  suspended: 5,
};

export async function getCommercialObservabilitySnapshot(
  properties: ControlPlaneProperty[],
  now = new Date(),
): Promise<CommercialObservabilitySnapshot> {
  const propertyNames = new Map(properties.map((property) => [property.id, property.displayName]));
  const attention = properties
    .map((property) => classifyAttention(property, now.getTime()))
    .filter((item): item is CommercialAttentionItem => Boolean(item))
    .sort((left, right) => {
      const priority = ATTENTION_PRIORITY[left.level] - ATTENTION_PRIORITY[right.level];
      if (priority !== 0) return priority;
      const leftEnd = left.trialEndsAt ? Date.parse(left.trialEndsAt) : Number.POSITIVE_INFINITY;
      const rightEnd = right.trialEndsAt ? Date.parse(right.trialEndsAt) : Number.POSITIVE_INFINITY;
      return leftEnd - rightEnd || left.displayName.localeCompare(right.displayName);
    });

  // Reviewed platform-authority observability read. This intentionally spans
  // properties only after Control Plane administrator authorization and reads
  // immutable commercial lifecycle history without mutating tenant state.
  const { data, error } = await supabaseAdmin
    .from("property_commercial_lifecycle_events")
    .select(
      "id, property_id, action, previous_status, new_status, plan_code, trial_ends_at, reason, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`P3_4_COMMERCIAL_HISTORY_UNAVAILABLE:${error.message}`);

  const recentEvents = ((data || []) as LifecycleEventRow[]).map((row) => ({
    id: row.id,
    propertyId: row.property_id,
    displayName: propertyNames.get(row.property_id) || row.property_id,
    action: row.action,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    planCode: row.plan_code,
    trialEndsAt: row.trial_ends_at,
    reason: row.reason,
    createdAt: row.created_at,
  }));

  return {
    attention,
    attentionCount: attention.length,
    expiredCount: attention.filter((item) => item.level === "expired").length,
    dueWithinOneDayCount: attention.filter((item) => item.level === "one_day").length,
    dueWithinThreeDaysCount: attention.filter((item) => item.level === "three_days").length,
    dueWithinSevenDaysCount: attention.filter((item) => item.level === "seven_days").length,
    pendingCount: attention.filter((item) => item.level === "pending").length,
    suspendedCount: attention.filter((item) => item.level === "suspended").length,
    recentEvents,
    generatedAt: now.toISOString(),
  };
}
