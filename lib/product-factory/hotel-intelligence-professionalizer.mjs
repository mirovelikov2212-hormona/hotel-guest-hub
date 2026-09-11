const CRITICAL_ATTRIBUTES = new Set([
  "check_in", "check_out", "hours", "external_access", "access", "pet_policy", "smoking_policy", "quiet_hours",
  "cancellation_policy", "payment_policy", "price", "booking",
]);

function text(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function key(value) {
  return text(value).toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
}

function unique(values) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

function verificationStatus(fact) {
  const status = String(fact?.verification?.status || "UNSCORED");
  return ["VERIFIED", "SINGLE_SOURCE", "CONFLICT"].includes(status) ? status : "UNSCORED";
}

function reviewRequired(fact) {
  const status = verificationStatus(fact);
  const attribute = key(fact?.attribute);
  return status === "CONFLICT"
    || (CRITICAL_ATTRIBUTES.has(attribute) && status !== "VERIFIED")
    || Number(fact?.confidence ?? 0) < 0.9;
}

function professionalItem(item) {
  const needsReview = reviewRequired(item);
  const targets = unique([...(item.targets || []), ...(needsReview ? ["review"] : [])]);
  return {
    ...item,
    status: needsReview ? "review_required" : "candidate",
    targets,
  };
}

function worstVerification(items) {
  const statuses = new Set(items.map(verificationStatus));
  if (statuses.has("CONFLICT")) return "CONFLICT";
  if (statuses.has("SINGLE_SOURCE")) return "SINGLE_SOURCE";
  if (statuses.has("UNSCORED")) return "UNSCORED";
  return "VERIFIED";
}

function blueprintEntities(items, allowedCategories) {
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
    };
  });
}

export function professionalizeHotelIntelligencePackage(basePackage) {
  const facts = (basePackage?.evidenceLayer?.facts || []).map(professionalItem);
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const remap = (items) => (items || []).map((item) => byId.get(item.id) || professionalItem(item));

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
    evidenceLayer: {
      ...basePackage.evidenceLayer,
      facts,
    },
    factoryBlueprint: {
      rooms: blueprintEntities(facts, new Set(["accommodation"])),
      venues: blueprintEntities(facts, new Set(["dining"])),
      services: blueprintEntities(facts, new Set(["wellness", "services"])),
      policies: blueprintEntities(facts, new Set(["policy"])),
      operations: blueprintEntities(facts, new Set(["operations"])),
      amenities: blueprintEntities(facts, new Set(["amenities", "parking"])),
    },
    routing: { hub, smartSetup, designStudio, review },
    readiness: {
      ...basePackage.readiness,
      reviewRequiredCount: review.length + (basePackage?.evidenceLayer?.uncertainties?.length || 0),
      verifiedFactCount,
      singleSourceFactCount,
      conflictFactCount,
    },
  };
}
