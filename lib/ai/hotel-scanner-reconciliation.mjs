import { validateHotelIntelligenceValue } from "./hotel-intelligence-value-quality.mjs";
import { refineHotelPolicySemantics } from "./hotel-policy-semantics.mjs";

const MIN_SUPPORTED_CONFIDENCE = 0.8;
const MAX_ROOM_TYPES = 40;

const FIELD_RULES = {
  address: {
    attributes: new Set(["address"]),
    categories: new Set(["location", "identity"]),
    label: /(?:^|\b)(address|hotel address|postal address|адрес|адрес на хотела)(?:\b|$)/iu,
    uncertainty: /(address|адрес)/iu,
  },
  checkIn: {
    attributes: new Set(["check_in", "checkin"]),
    categories: new Set(["operations"]),
    label: /(?:check[ -]?in|checkin|час за настаняване|настаняване от|настаняване)/iu,
    uncertainty: /(?:check[ -]?in|checkin|час(?:ът|овете)? за настаняване|настаняв)/iu,
  },
  checkOut: {
    attributes: new Set(["check_out", "checkout"]),
    categories: new Set(["operations"]),
    label: /(?:check[ -]?out|checkout|час за освобождаване|освобождаване|напускане)/iu,
    uncertainty: /(?:check[ -]?out|checkout|час(?:ът|овете)? за освобождаване|освобождав|напускан)/iu,
  },
  roomTypes: {
    attributes: new Set(["room_type"]),
    categories: new Set(["accommodation"]),
    label: /(?:^|\b)(room type|official room type|accommodation type|тип стая|вид стая|тип помещение)(?:\b|$)/iu,
    uncertainty: /(?:room types?|room categor|типов(?:е|ете)? стаи|видов(?:е|ете)? стаи|типов(?:е|ете)? помещения)/iu,
  },
};

// Policy completeness is not a scanner approval blocker. StayHub only needs an
// inventory of available policy topics; full policy text can be attached later.
// Genuine policy contradictions are appended after reconciliation and are not
// filtered here.
const GENERIC_POLICY_GAP = /(?:(?:polic(?:y|ies)|rules?|политик(?:а|и|ите)?|правил(?:а|ата)?).*(?:not (?:specified|stated|found)|missing|не (?:са|е) (?:посочен|описан|намерен))|(?:анулац|cancell|домашн.*любим|pets?|children|kids|деца|payment|плащан).*(?:not (?:specified|stated|found)|missing|не (?:са|е) (?:посочен|описан|намерен)))/iu;

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value) {
  return text(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\s.,;:!?()[\]{}"'`]+/g, " ")
    .trim();
}

function uniqueText(values, max = 80) {
  const seen = new Set();
  const result = [];
  for (const raw of values || []) {
    const value = text(raw);
    const key = normalized(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= max) break;
  }
  return result;
}

function fieldForFact(fact) {
  const category = normalized(fact?.category).replace(/ /g, "_");
  const attribute = normalized(fact?.attribute).replace(/ /g, "_");
  const label = text(fact?.label);
  for (const [field, rule] of Object.entries(FIELD_RULES)) {
    if (rule.attributes.has(attribute)) return field;
    if (rule.categories.has(category) && rule.label.test(label)) return field;
  }
  return "";
}

function semanticFactTopic(fact) {
  const field = fieldForFact(fact);
  if (field) return field;

  const category = normalized(fact?.category).replace(/ /g, "_");
  const label = normalized(fact?.label);
  const value = normalized(fact?.value);
  const haystack = `${label} ${value}`;

  if (category === "contact" && (/(?:e mail|email|имейл|електронна поща)/iu.test(label) || value.includes("@"))) return "contact_email";
  if (category === "contact" && /(?:phone|telephone|tel|телефон)/iu.test(label)) return "contact_phone";
  if (category === "policy" && /(?:pet|pets|домашн.*любим)/iu.test(haystack)) return "pet_policy";
  if (["dining", "wellness", "services", "amenities"].includes(category) && /(?:hours|opening|working|работно време|часове)/iu.test(label)) {
    const facility = label.replace(/(?:opening hours|working hours|hours|работно време|часове)/giu, " ").replace(/\s+/g, " ").trim();
    if (facility) return `${category}_hours:${facility}`;
  }
  return label;
}

function supportedFact(fact) {
  const confidence = Number(fact?.confidence ?? 0);
  const valueValidation = validateHotelIntelligenceValue(fact);
  return valueValidation.valid && Number.isFinite(confidence) && confidence >= MIN_SUPPORTED_CONFIDENCE && Array.isArray(fact?.sourceUrls) && fact.sourceUrls.some((url) => text(url));
}

function mergeFact(left, right) {
  return { ...left, confidence: Math.max(Number(left.confidence || 0), Number(right.confidence || 0)), sourceUrls: uniqueText([...(left.sourceUrls || []), ...(right.sourceUrls || [])], 8) };
}

function dedupeSemanticFacts(facts) {
  const byKey = new Map();
  const duplicateGroups = [];
  for (const raw of Array.isArray(facts) ? facts : []) {
    if (!raw || typeof raw !== "object") continue;
    const category = normalized(raw.category);
    const label = normalized(raw.label);
    const value = normalized(raw.value);
    if (!category || !label || !value) continue;
    const field = fieldForFact(raw);
    const semanticLabel = semanticFactTopic(raw);
    const key = `${category}|${semanticLabel}|${value}`;
    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, { ...raw, category: text(raw.category), label: text(raw.label), value: text(raw.value), sourceUrls: uniqueText(raw.sourceUrls || [], 8) });
      continue;
    }
    byKey.set(key, mergeFact(previous, raw));
    duplicateGroups.push({ field: field || null, category: text(raw.category), value: text(raw.value) });
  }
  return { facts: [...byKey.values()], duplicateGroups };
}

function evidenceForField(facts, field) {
  return facts.filter((fact) => fieldForFact(fact) === field).filter(supportedFact);
}

function uniqueEvidenceValues(facts) {
  const byValue = new Map();
  for (const fact of facts) {
    const key = normalized(fact.value);
    if (!key) continue;
    const existing = byValue.get(key);
    if (!existing) {
      byValue.set(key, { value: text(fact.value), confidence: Number(fact.confidence), sourceUrls: uniqueText(fact.sourceUrls || [], 8) });
      continue;
    }
    existing.confidence = Math.max(existing.confidence, Number(fact.confidence));
    existing.sourceUrls = uniqueText([...existing.sourceUrls, ...(fact.sourceUrls || [])], 8);
  }
  return [...byValue.values()];
}

function applyScalar(profile, field, path, applied, issues) {
  const facts = evidenceForField(profile.facts, field);
  const values = uniqueEvidenceValues(facts);
  if (values.length === 0) return;
  if (values.length > 1) {
    issues.push({
      kind: "evidence_conflict",
      field: path,
      profileValue: text(path === "identity.address" ? profile.identity?.address : path === "operations.checkIn" ? profile.operations?.checkIn : profile.operations?.checkOut),
      evidenceValues: values,
    });
    return;
  }
  const evidence = values[0];
  const current = path === "identity.address" ? text(profile.identity?.address) : path === "operations.checkIn" ? text(profile.operations?.checkIn) : text(profile.operations?.checkOut);
  if (normalized(current) === normalized(evidence.value)) return;
  if (path === "identity.address") profile.identity.address = evidence.value;
  else if (path === "operations.checkIn") profile.operations.checkIn = evidence.value;
  else profile.operations.checkOut = evidence.value;
  applied.push({ field: path, action: current ? "replaced_profile_value" : "filled_missing_profile_value", previousValue: current, value: evidence.value, confidence: evidence.confidence, sourceUrls: evidence.sourceUrls });
}

function applyRoomTypes(profile, applied, issues) {
  const facts = evidenceForField(profile.facts, "roomTypes");
  const evidence = uniqueEvidenceValues(facts).slice(0, MAX_ROOM_TYPES);
  if (!evidence.length) return;
  const current = uniqueText(profile.hospitality?.roomTypes || [], MAX_ROOM_TYPES);
  const evidenceValues = evidence.map((item) => item.value);
  const currentKeys = new Set(current.map(normalized));
  const evidenceKeys = new Set(evidenceValues.map(normalized));
  const same = current.length === evidenceValues.length && current.every((item) => evidenceKeys.has(normalized(item)));
  if (same) return;
  if (evidenceValues.length >= current.length) {
    profile.hospitality.roomTypes = evidenceValues;
    applied.push({ field: "hospitality.roomTypes", action: current.length ? "replaced_profile_collection" : "filled_missing_profile_collection", previousValue: current, value: evidenceValues, confidence: Math.min(...evidence.map((item) => item.confidence)), sourceUrls: uniqueText(evidence.flatMap((item) => item.sourceUrls), 12) });
    return;
  }
  const merged = uniqueText([...current, ...evidenceValues], MAX_ROOM_TYPES);
  profile.hospitality.roomTypes = merged;
  issues.push({ kind: "profile_evidence_partial", field: "hospitality.roomTypes", profileValue: current, evidenceValues: evidence, unsupportedProfileValues: current.filter((item) => !evidenceKeys.has(normalized(item))), evidenceOnlyValues: evidenceValues.filter((item) => !currentKeys.has(normalized(item))) });
}

function fieldHasSupportedEvidence(profile, field) {
  return evidenceForField(profile.facts, field).length > 0;
}

function fieldHasProfileValue(profile, field) {
  if (field === "address") return Boolean(text(profile.identity?.address));
  if (field === "checkIn") return Boolean(text(profile.operations?.checkIn));
  if (field === "checkOut") return Boolean(text(profile.operations?.checkOut));
  if (field === "roomTypes") return Array.isArray(profile.hospitality?.roomTypes) && profile.hospitality.roomTypes.length > 0;
  return false;
}

function reconcileUncertainties(profile, resolvedUncertainties) {
  const retained = [];
  for (const raw of Array.isArray(profile.uncertainties) ? profile.uncertainties : []) {
    const uncertainty = text(raw);
    if (!uncertainty) continue;
    const resolvedField = Object.entries(FIELD_RULES).find(([field, rule]) => (
      rule.uncertainty.test(uncertainty) && fieldHasSupportedEvidence(profile, field) && fieldHasProfileValue(profile, field)
    ))?.[0];
    if (resolvedField) {
      resolvedUncertainties.push({ field: resolvedField, uncertainty });
      continue;
    }
    if (GENERIC_POLICY_GAP.test(uncertainty)) {
      resolvedUncertainties.push({ field: "policy_inventory", uncertainty });
      continue;
    }
    retained.push(uncertainty);
  }
  profile.uncertainties = uniqueText(retained, 40);
}

function completeness(profile) {
  const tracked = ["address", "checkIn", "checkOut", "roomTypes"];
  const present = tracked.filter((field) => fieldHasProfileValue(profile, field));
  return { trackedFields: tracked.length, presentFields: present.length, missingFields: tracked.filter((field) => !present.includes(field)) };
}

export function reconcileHotelScanProfileWithFacts(inputProfile) {
  const profile = JSON.parse(JSON.stringify(inputProfile || {}));
  profile.identity ||= {};
  profile.operations ||= {};
  profile.hospitality ||= {};
  profile.facts ||= [];
  profile.uncertainties ||= [];

  const semanticallyRefinedFacts = profile.facts.map(refineHotelPolicySemantics);
  const { facts, duplicateGroups } = dedupeSemanticFacts(semanticallyRefinedFacts);
  profile.facts = facts;

  const applied = [];
  const issues = [];
  const resolvedUncertainties = [];
  applyScalar(profile, "address", "identity.address", applied, issues);
  applyScalar(profile, "checkIn", "operations.checkIn", applied, issues);
  applyScalar(profile, "checkOut", "operations.checkOut", applied, issues);
  applyRoomTypes(profile, applied, issues);
  reconcileUncertainties(profile, resolvedUncertainties);

  return {
    profile,
    reconciliation: {
      schemaVersion: "hotel-scan-reconciliation-v1",
      minimumEvidenceConfidence: MIN_SUPPORTED_CONFIDENCE,
      applied,
      issues,
      semanticDuplicatesRemoved: duplicateGroups,
      resolvedUncertainties,
      completeness: completeness(profile),
    },
  };
}
