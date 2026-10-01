export type RecommendationCandidate = {
  fingerprint: string;
  sourceType: "request_pattern" | "ai_intent" | "incident_pattern" | "manual";
  sourceRef: string | null;
  incidentId: string | null;
  module: string;
  department: string | null;
  actionMode: "recommendation_only" | "manager_approved_configuration" | "manual_action";
  actionType: string;
  title: string;
  problem: string;
  recommendation: string;
  expectedOutcome: string;
  evidenceQuality: "low" | "medium" | "high";
  confidence: number | null;
  evidence: Record<string, unknown>;
  actionPayload: Record<string, unknown>;
  baseline: Record<string, unknown>;
};

export function detectDelayedRequestPattern(input?: Record<string, unknown>): RecommendationCandidate | null;
export function detectAiIntentConversionPattern(input?: Record<string, unknown>): RecommendationCandidate | null;
export function detectRecurringIncidentPattern(input?: Record<string, unknown>): RecommendationCandidate | null;
export function buildRecommendationCandidates(input?: Record<string, unknown>): RecommendationCandidate[];
export function classifyMeasuredImpact(input?: Record<string, unknown>): {
  outcome: "positive" | "no_material_change" | "negative" | "insufficient_data";
  delta: number | null;
  improvement?: number;
};
export function measureRecommendationImpact(input?: Record<string, unknown>): Record<string, unknown>;
export function buildManagerIntelligenceKpis(recommendations?: Array<Record<string, unknown>>): Record<string, unknown>;
export const MANAGER_INTELLIGENCE_MEASUREMENT_DAYS: number;
