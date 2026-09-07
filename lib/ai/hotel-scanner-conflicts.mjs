import { validateHotelIntelligenceValue } from "./hotel-intelligence-value-quality.mjs";

const MIN_CONFLICT_CONFIDENCE = 0.8;

function text(value, max = 500) {
  const normalized = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

function normalized(value) {
  return text(value)
    .toLocaleLowerCase("en-US")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\s.,;:!?()[\]{}"'`]+/g, " ")
    .trim();
}

function unique(values, max = 12) {
  return [...new Set((values || []).map((value) => text(value, 2_048)).filter(Boolean))].slice(0, max);
}

function supported(fact) {
  const confidence = Number(fact?.confidence ?? 0);
  return validateHotelIntelligenceValue(fact).valid
    && Number.isFinite(confidence)
    && confidence >= MIN_CONFLICT_CONFIDENCE
    && Array.isArray(fact?.sourceUrls)
    && fact.sourceUrls.some((url) => text(url));
}

function petPolarity(value) {
  const candidate = normalized(value);
  if (/(?:no pets?|pets? (?:are )?not (?:allowed|permitted|accepted)|not allowed|not permitted|prohibit|forbidden|забран|не се (?:допуск|разреш|прием)|домашни любимци не)/iu.test(candidate)) {
    return "prohibited";
  }
  if (/(?:pets? (?:are )?(?:allowed|permitted|accepted|welcome)|allowed|permitted|accepted|допуск|разреш|позвол|приемат домашни любимци)/iu.test(candidate)) {
    return "allowed";
  }
  return "unknown";
}

function topicForFact(fact) {
  const category = normalized(fact?.category);
  const label = normalized(fact?.label);
  const value = normalized(fact?.value);
  const haystack = `${label} ${value}`;

  if ((category === "location" || category === "identity") && /(?:address|адрес)/iu.test(label)) {
    return { key: "address", mode: "scalar", label: "Address" };
  }
  if (category === "operations" && /(?:check[ -]?in|checkin|настаняване)/iu.test(label)) {
    return { key: "check_in", mode: "scalar", label: "Check-in" };
  }
  if (category === "operations" && /(?:check[ -]?out|checkout|освобождаване|напускане)/iu.test(label)) {
    return { key: "check_out", mode: "scalar", label: "Check-out" };
  }
  if (category === "policy" && /(?:pet|pets|домашн.*любим)/iu.test(haystack)) {
    return { key: "pet_policy", mode: "pet_policy", label: "Pet policy" };
  }
  if (["dining", "wellness", "services", "amenities"].includes(category)
      && /(?:hours|opening|работно време|часове)/iu.test(label)) {
    const semanticLabel = label
      .replace(/(?:opening hours|working hours|hours|работно време|часове)/giu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (semanticLabel) {
      return { key: `${category}_hours:${semanticLabel}`, mode: "scalar", label: text(fact.label, 160) };
    }
  }
  return null;
}

function mergeClaim(left, right) {
  return {
    ...left,
    confidence: Math.max(left.confidence, right.confidence),
    sourceUrls: unique([...left.sourceUrls, ...right.sourceUrls]),
  };
}

function claimFromFact(fact, mode) {
  return {
    category: text(fact.category, 80),
    label: text(fact.label, 160),
    value: text(fact.value, 500),
    confidence: Number(fact.confidence),
    sourceUrls: unique(fact.sourceUrls || []),
    polarity: mode === "pet_policy" ? petPolarity(fact.value) : null,
  };
}

function groupedClaims(facts) {
  const topics = new Map();
  for (const fact of Array.isArray(facts) ? facts : []) {
    if (!supported(fact)) continue;
    const topic = topicForFact(fact);
    if (!topic) continue;
    const claim = claimFromFact(fact, topic.mode);
    const valueKey = normalized(claim.value);
    const existingTopic = topics.get(topic.key) || { topic, claims: new Map() };
    const existingClaim = existingTopic.claims.get(valueKey);
    existingTopic.claims.set(valueKey, existingClaim ? mergeClaim(existingClaim, claim) : claim);
    topics.set(topic.key, existingTopic);
  }
  return topics;
}

function isConflict(topic, claims) {
  if (claims.length < 2) return false;
  if (topic.mode === "pet_policy") {
    const polarities = new Set(claims.map((claim) => claim.polarity).filter((value) => value !== "unknown"));
    return polarities.has("allowed") && polarities.has("prohibited");
  }
  return true;
}

export function detectHotelScanConflicts(profile) {
  const topics = groupedClaims(profile?.facts || []);
  const conflicts = [];

  for (const [topicKey, entry] of topics.entries()) {
    const claims = [...entry.claims.values()];
    if (!isConflict(entry.topic, claims)) continue;
    conflicts.push({
      id: `scanner-conflict:${topicKey}`,
      topic: topicKey,
      topicLabel: entry.topic.label,
      state: "CONFLICT",
      reviewRequired: true,
      claims,
      sourceUrls: unique(claims.flatMap((claim) => claim.sourceUrls)),
    });
  }

  return conflicts;
}

function conflictNote(conflict, outputLanguage) {
  const values = conflict.claims.map((claim) => `“${text(claim.value, 180)}”`).join(" ↔ ");
  if (outputLanguage === "bg") {
    const topic = conflict.topic === "pet_policy" ? "Политика за домашни любимци" : conflict.topicLabel;
    return `Конфликт [${topic}]: ${values}. Изисква човешки преглед.`;
  }
  const topic = conflict.topic === "pet_policy" ? "Pet policy" : conflict.topicLabel;
  return `Conflict [${topic}]: ${values}. Human review required.`;
}

export function attachHotelScanConflictReview(profile, conflicts, outputLanguage = "en") {
  const nextProfile = JSON.parse(JSON.stringify(profile || {}));
  const existing = Array.isArray(nextProfile.uncertainties) ? nextProfile.uncertainties : [];
  const notes = (conflicts || []).map((conflict) => conflictNote(conflict, outputLanguage));
  nextProfile.uncertainties = unique([...existing, ...notes], 80);
  return { profile: nextProfile, conflictNotes: notes };
}
