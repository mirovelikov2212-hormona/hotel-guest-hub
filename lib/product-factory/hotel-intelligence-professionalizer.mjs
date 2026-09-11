function text(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function key(value) {
  return text(value).toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
}

function claimKey(value) {
  return text(value)
    .toLocaleLowerCase("en-US")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\s.,;:!?()[\]{}"'`]+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

function verificationStatus(fact) {
  const status = String(fact?.verification?.status || "UNSCORED");
  return ["VERIFIED", "SINGLE_SOURCE", "CONFLICT"].includes(status) ? status : "UNSCORED";
}

function assertResolvedApprovedConflicts(facts) {
  const groups = new Map();
  for (const fact of facts || []) {
    if (verificationStatus(fact) !== "CONFLICT") continue;
    const category = key(fact?.category);
    const subject = key(fact?.subject) || "hotel";
    const attribute = key(fact?.attribute) || key(fact?.label) || "fact";
    const groupKey = `${category}|${subject}|${attribute}`;
    const values = groups.get(groupKey) || new Set();
    const value = claimKey(fact?.value);
    if (value) values.add(value);
    groups.set(groupKey, values);
  }
  for (const [groupKey, values] of groups.entries()) {
    if (values.size > 1) throw new Error(`HOTEL_INTELLIGENCE_APPROVED_CONFLICT_UNRESOLVED:${groupKey}`);
  }
}

function reviewRequired(fact, options) {
  if (options.humanReviewResolved === true) return false;
  return verificationStatus(fact) === "CONFLICT" || Number(fact?.confidence ?? 0) < 0.9;
}

function professionalItem(item, options) {
  const needsReview = reviewRequired(item, options);
  const withoutReview = (item.targets || []).filter((target) => target !== "review");
  const targets = unique([...(needsReview ? item.targets || [] : withoutReview), ...(needsReview ? ["review"] : [])]);
  return { ...item, status: needsReview ? "review_required" : "candidate", targets };
}

function worstVerification(items) {
  const statuses = new Set(items.map(verificationStatus));
  if (statuses.has("CONFLICT")) return "CONFLICT";
  if (statuses.has("SINGLE_SOURCE")) return "SINGLE_SOURCE";
  if (statuses.has("UNSCORED")) return "UNSCORED";
  return "VERIFIED";
}

function blueprintEntities(items, allowedCategories, options) {
  const groups = new Map();
  for (const item of items) {
    const category = key(item?.category);
    if (!allowedCategories.has(category)) continue;
    const subject = text(item?.subject) || (["operations", "policy"].includes(category) ? "hotel" : text(item?.label));
    if (!subject) continue;
    const groupKey = `${category}|${key(subject)}`;
    const group = groups.get(groupKey) || [];
    group.push(item);
    groups.set(groupKey, group);
  }

  return [...groups.entries()].map(([groupKey, group]) => {
    const [category] = groupKey.split("|");
    const name = text(group[0]?.subject) || (["operations", "policy"].includes(category) ? "hotel" : text(group[0]?.label));
    const attributes = {};
    for (const item of group) {
      const attribute = key(item?.attribute) || key(item?.label) || "fact";
      attributes[attribute] = unique([...(attributes[attribute] || []), item?.value]);
    }
    return {
      name,
      category,
      attributes,
      sourceUrls: unique(group.flatMap((item) => item?.sourceUrls || [])),
      verification: worstVerification(group),
      reviewRequired: group.some((item) => item.status === "review_required"),
      humanReviewResolved: options.humanReviewResolved === true,
    };
  });
}

export function professionalizeHotelIntelligencePackage(basePackage, options = {}) {
  const normalizedOptions = { humanReviewResolved: options?.humanReviewResolved === true };
  const originalFacts = basePackage?.evidenceLayer?.facts || [];
  if (normalizedOptions.humanReviewResolved) assertResolvedApprovedConflicts(originalFacts);

  const facts = originalFacts.map((item) => professionalItem(item, normalizedOptions));
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const remap = (items) => (items || []).map((item) => byId.get(item.id) || professionalItem(item, normalizedOptions));

  const hub = remap(basePackage?.routing?.hub);
  const smartSetup = remap(basePackage?.routing?.smartSetup);
  const designStudio = remap(basePackage?.routing?.designStudio);
  const review = facts.filter((fact) => fact.status === "review_required" || fact.targets.includes("review"));

  const verifiedFactCount = facts.filter((fact) => verificationStatus(fact) === "VERIFIED").length;
  const singleSourceFactCount = facts.filter((fact) => verificationStatus(fact) === "SINGLE_SOURCE").length;
  const conflictFactCount = facts.filter((fact) => verificationStatus(fact) === "CONFLICT").length;

  return {
    ...basePackage,
    pipelineVersion: "professional-crawler-v2",
    evidenceLayer: { ...basePackage.evidenceLayer, facts },
    factoryBlueprint: {
      rooms: blueprintEntities(facts, new Set(["accommodation"]), normalizedOptions),
      venues: blueprintEntities(facts, new Set(["dining"]), normalizedOptions),
      services: blueprintEntities(facts, new Set(["wellness", "services"]), normalizedOptions),
      policies: blueprintEntities(facts, new Set(["policy"]), normalizedOptions),
      operations: blueprintEntities(facts, new Set(["operations"]), normalizedOptions),
      amenities: blueprintEntities(facts, new Set(["amenities", "parking"]), normalizedOptions),
    },
    routing: { hub, smartSetup, designStudio, review },
    readiness: {
      ...basePackage.readiness,
      reviewRequiredCount: review.length + (basePackage?.evidenceLayer?.uncertainties?.length || 0),
      verifiedFactCount,
      singleSourceFactCount,
      conflictFactCount,
      humanReviewResolved: normalizedOptions.humanReviewResolved,
    },
  };
}
