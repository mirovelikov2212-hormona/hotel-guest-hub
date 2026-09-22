import {
  validateHubOfferV2,
  type HubOfferV2,
} from "../product-factory/hub-offer-contract.ts";
import { buildHotelConfigVersionDiff } from "./factory-production-version-diff.mjs";
import { applyManagerServiceContentChanges } from "./manager-service-content-model.mjs";
import { applyManagerVenueContentChanges } from "./manager-venue-content-model.mjs";
import { prepareManagerOperationalScheduleChange } from "./manager-operational-schedule-changes.mjs";

type JsonObject = Record<string, unknown>;
type ManagerChangeScope = "offers" | "services" | "venues" | "schedules";

const DIFF_CATEGORY_BY_SCOPE: Record<ManagerChangeScope, string> = {
  offers: "content",
  services: "services",
  venues: "venues",
  schedules: "hours",
};

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeScopes(value: unknown): ManagerChangeScope[] {
  if (!Array.isArray(value)) throw new Error("CM5_CANDIDATE_SCOPE_INVALID");
  const allowed = new Set<ManagerChangeScope>(["offers","services","venues","schedules"]);
  const scopes = [...new Set(
    value.map((item) => clean(item).toLowerCase()).filter(Boolean),
  )].sort() as ManagerChangeScope[];

  if (
    scopes.length < 1
    || scopes.length > 4
    || scopes.some((scope) => !allowed.has(scope))
  ) {
    throw new Error("CM5_CANDIDATE_SCOPE_INVALID");
  }
  return scopes;
}

function runtimeOffer(offer: HubOfferV2) {
  if (offer.status !== "active" && offer.status !== "scheduled") return null;
  return {
    id: offer.id,
    key: offer.key,
    titleByLang: structuredClone(offer.titleByLang),
    shortDescriptionByLang: structuredClone(offer.shortDescriptionByLang),
    descriptionByLang: structuredClone(offer.descriptionByLang),
    badgeByLang: structuredClone(offer.badgeByLang),
    pricing: structuredClone(offer.pricing),
    validity: structuredClone(offer.validity),
    cta: structuredClone(offer.cta),
    assets: structuredClone(offer.assets),
    presentationMode: offer.presentationMode || "structured",
    status: offer.status,
    sortOrder: offer.sortOrder,
  };
}

function applyOfferOperation(config: JsonObject, operation: JsonObject) {
  if (
    operation.schemaVersion !== "manager-offer-change-v1"
    || operation.kind !== "replace_offers"
    || !Array.isArray(operation.offers)
  ) {
    throw new Error("CM5_CANDIDATE_OFFER_OPERATION_INVALID");
  }

  const offers = operation.offers.map((value) => {
    const validation = validateHubOfferV2(value);
    if (!validation.ok) {
      throw new Error("CM5_CANDIDATE_OFFER_INVALID:" + validation.errors.join(","));
    }
    return structuredClone(value) as HubOfferV2;
  });

  const ids = offers.map((offer) => offer.id);
  const keys = offers.map((offer) => offer.key);
  if (ids.length !== new Set(ids).size) throw new Error("CM5_CANDIDATE_OFFER_ID_DUPLICATE");
  if (keys.length !== new Set(keys).size) throw new Error("CM5_CANDIDATE_OFFER_KEY_DUPLICATE");

  const next = structuredClone(config);
  next.offers = offers.map(runtimeOffer).filter(Boolean);
  return next;
}

function scopeForOperation(operation: JsonObject): ManagerChangeScope {
  const kind = clean(operation.kind);
  if (
    operation.schemaVersion === "manager-offer-change-v1"
    && kind === "replace_offers"
  ) return "offers";
  if (
    operation.schemaVersion === "manager-service-change-v1"
    && kind === "service_content_update"
  ) return "services";
  if (
    operation.schemaVersion === "manager-venue-change-v1"
    && kind === "venue_content_update"
  ) return "venues";
  if (
    operation.schemaVersion === "manager-operational-schedule-change-v1"
    && kind === "set_department_schedule"
  ) return "schedules";
  throw new Error("CM5_CANDIDATE_OPERATION_INVALID");
}

function operationsByScope(operations: unknown) {
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > 300) {
    throw new Error("CM5_CANDIDATE_OPERATIONS_INVALID");
  }

  const result: Record<ManagerChangeScope, JsonObject[]> = {
    offers: [],
    services: [],
    venues: [],
    schedules: [],
  };

  for (const value of operations) {
    if (!isRecord(value)) throw new Error("CM5_CANDIDATE_OPERATION_INVALID");
    result[scopeForOperation(value)].push(structuredClone(value));
  }

  if (result.offers.length > 1) throw new Error("CM5_CANDIDATE_OFFER_OPERATION_DUPLICATE");
  return result;
}

function assertDeclaredScopeMatchesOperations(
  scopes: ManagerChangeScope[],
  grouped: Record<ManagerChangeScope, JsonObject[]>,
) {
  for (const scope of ["offers","services","venues","schedules"] as ManagerChangeScope[]) {
    const declared = scopes.includes(scope);
    const present = grouped[scope].length > 0;
    if (declared !== present) {
      throw new Error(`CM5_CANDIDATE_SCOPE_OPERATION_MISMATCH:${scope}`);
    }
  }
}

function applyScheduleOperations(
  config: JsonObject,
  operations: JsonObject[],
) {
  let candidate = structuredClone(config);
  const seen = new Set<string>();

  for (const operation of operations) {
    const department = clean(operation.department).toLowerCase();
    if (!department || seen.has(department)) {
      throw new Error("CM5_CANDIDATE_SCHEDULE_OPERATION_DUPLICATE");
    }
    seen.add(department);

    const prepared = prepareManagerOperationalScheduleChange({
      liveConfig: candidate,
      department,
      schedule: operation.schedule,
    });
    candidate = prepared.candidateConfig;
  }

  return candidate;
}

export function buildConfirmedManagerCandidate(input: {
  baseConfig: unknown;
  changeScope: unknown;
  operations: unknown;
  expectedDiffHash: unknown;
}) {
  if (!isRecord(input.baseConfig)) throw new Error("CM5_CANDIDATE_BASE_CONFIG_INVALID");
  const expectedDiffHash = clean(input.expectedDiffHash).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedDiffHash)) {
    throw new Error("CM5_CANDIDATE_DIFF_HASH_INVALID");
  }

  const scopes = normalizeScopes(input.changeScope);
  const grouped = operationsByScope(input.operations);
  assertDeclaredScopeMatchesOperations(scopes, grouped);

  let candidate = structuredClone(input.baseConfig);

  if (grouped.offers.length) {
    candidate = applyOfferOperation(candidate, grouped.offers[0]);
  }

  if (grouped.services.length) {
    candidate = applyManagerServiceContentChanges({
      liveConfig: candidate,
      operations: grouped.services,
    }).candidateConfig;
  }

  if (grouped.venues.length) {
    candidate = applyManagerVenueContentChanges({
      liveConfig: candidate,
      operations: grouped.venues,
    }).candidateConfig;
  }

  if (grouped.schedules.length) {
    candidate = applyScheduleOperations(candidate, grouped.schedules);
  }

  const diff = buildHotelConfigVersionDiff(input.baseConfig, candidate);
  if (!diff.changed) throw new Error("CM5_CANDIDATE_NO_CHANGE");
  if (diff.diffHash !== expectedDiffHash) {
    throw new Error("CM5_CANDIDATE_DIFF_HASH_MISMATCH");
  }

  const allowedCategories = new Set(scopes.map((scope) => DIFF_CATEGORY_BY_SCOPE[scope]));
  const unexpectedCategories = diff.changedCategories.filter(
    (category) => !allowedCategories.has(category),
  );
  if (unexpectedCategories.length) {
    throw new Error("CM5_CANDIDATE_DIFF_SCOPE_VIOLATION");
  }

  return {
    schemaVersion: "manager-change-candidate-v1",
    changeScope: scopes,
    candidateConfig: candidate,
    diff,
    validation: {
      ok: true,
      deterministicReplay: true,
      diffHashMatched: true,
      changedCategories: diff.changedCategories,
    },
  };
}
