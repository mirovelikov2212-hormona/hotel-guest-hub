import {
  buildHotelConfigVersionDiff,
} from "./factory-production-version-diff.mjs";
import {
  applyManagerServiceContentChanges,
} from "./manager-service-content-model.mjs";
import {
  applyManagerVenueContentChanges,
} from "./manager-venue-content-model.mjs";

function assertDiffScope(diff, allowedCategory, code) {
  const unexpected = diff.changedCategories.filter(
    (category) => category !== allowedCategory,
  );
  if (unexpected.length) throw new Error(code);
}

export function prepareManagerServiceContentCandidate(input) {
  const applied = applyManagerServiceContentChanges(input);
  const diff = buildHotelConfigVersionDiff(
    input.liveConfig,
    applied.candidateConfig,
  );
  assertDiffScope(diff, "services", "CM5_SERVICE_DIFF_SCOPE_VIOLATION");

  return {
    schemaVersion: "manager-service-candidate-v1",
    candidateConfig: applied.candidateConfig,
    operations: structuredClone(input.operations),
    preview: applied.preview,
    diff,
  };
}

export function prepareManagerVenueContentCandidate(input) {
  const applied = applyManagerVenueContentChanges(input);
  const diff = buildHotelConfigVersionDiff(
    input.liveConfig,
    applied.candidateConfig,
  );
  assertDiffScope(diff, "venues", "CM5_VENUE_DIFF_SCOPE_VIOLATION");

  return {
    schemaVersion: "manager-venue-candidate-v1",
    candidateConfig: applied.candidateConfig,
    operations: structuredClone(input.operations),
    preview: applied.preview,
    diff,
  };
}
