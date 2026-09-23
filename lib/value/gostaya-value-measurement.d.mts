export type GostayaValueBaseline = {
  schemaVersion: "gostaya-value-baseline-v1";
  revision: number;
  currency: string;
  baselinePeriod: { from: string; to: string };
  source: {
    type:
      | "manual_time_study"
      | "call_log"
      | "staff_roster"
      | "finance_report"
      | "mixed";
    reference: string;
    notes: string;
  };
  assumptions: {
    receptionMinutesPerGuestRequest: number;
    receptionInfoMinutesPerQuestion: number;
    coordinationMinutesPerDirectDepartmentRequest: number;
    baselineDirectDepartmentRoutingRate: number;
    baselineInfoSelfServiceRate: number;
    serviceRecoveryResolutionMinutes: number;
    laborCostMinorPerHour: {
      reception: number;
      coordination: number;
      serviceRecovery: number;
    };
    gostayaMonthlyCostMinor: number;
    gostayaOneTimeCostMinor: number;
    oneTimeAmortizationMonths: number;
  };
};

export type GostayaValueMeasurement = {
  schemaVersion: "gostaya-value-measurement-v1";
  period: { from: string; to: string };
  baseline: {
    revision: number;
    currency: string;
    baselinePeriod: { from: string; to: string };
    goLiveAt: string;
    source: GostayaValueBaseline["source"];
  };
  measuredOperationalImpact: Record<string, number | null>;
  estimatedOperationalImpact: Record<string, number>;
  valueMinor: {
    currency: string;
    measured: {
      ancillaryRevenue: number;
      total: number;
    };
    estimated: {
      receptionBypass: number;
      aiContainment: number;
      avoidedCoordination: number;
      serviceRecovery: number;
      total: number;
    };
    combined: number;
    gostayaCost: number;
    excludedRevenueCurrencies: readonly string[];
  };
  roi: {
    measured: number | null;
    combined: number | null;
    measuredValueToCost: number | null;
    combinedValueToCost: number | null;
  };
  classification: {
    measuredValue: string;
    estimatedValue: string;
    benchmarkValue: string;
  };
};

export const GOSTAYA_VALUE_BASELINE_SCHEMA_VERSION:
  "gostaya-value-baseline-v1";
export const GOSTAYA_VALUE_MEASUREMENT_SCHEMA_VERSION:
  "gostaya-value-measurement-v1";

export function normalizeGostayaValueBaseline(
  input: unknown,
): GostayaValueBaseline;

export function buildGostayaValueMeasurement(input: {
  baseline: unknown;
  goLiveAt: string;
  period: { from: string; to: string };
  requests?: unknown[];
  events?: unknown[];
  revenueSnapshot?: unknown;
}): GostayaValueMeasurement;
