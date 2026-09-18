import {
  extractOperationalServiceLabelsV2,
  extractWaterFacilityLabelsV2,
} from "./hotel-scanner-v2-hospitality-taxonomy.mjs";

function clean(value, max = 500) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function entityKey(value) {
  return clean(value, 240).toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ş/g, "s")
    .replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set((values || []).map((value) => clean(value, 2_048)).filter(Boolean))];
}

function factSources(fact) {
  return unique(Array.isArray(fact?.sourceUrls) ? fact.sourceUrls : []);
}

function sourceIsIngestedDocument(fact, ingestedDocumentUrls) {
  return factSources(fact).some((url) => ingestedDocumentUrls.has(url));
}

function eligibleFact(fact) {
  const category = clean(fact?.category, 80).toLocaleLowerCase("en-US");
  const attribute = clean(fact?.attribute, 80).toLocaleLowerCase("en-US");
  return ["amenities", "experiences", "services"].includes(category)
    && ["facility", "amenity", "experience", "activity", "attraction", "service"].includes(attribute);
}

function candidatesFromFact(fact) {
  const haystack = [
    clean(fact?.subject, 300),
    clean(fact?.label, 300),
    clean(fact?.value, 1_500),
  ].filter(Boolean).join(" ");
  const result = [
    ...extractWaterFacilityLabelsV2(haystack),
    ...extractOperationalServiceLabelsV2(haystack),
  ];
  const seen = new Set();
  return result.filter((candidate) => {
    const key = `${candidate.domain}|${candidate.entityType}|${entityKey(candidate.name)}`;
    if (!entityKey(candidate.name) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameCandidate(item, candidate) {
  if (clean(item?.domain, 80) !== candidate.domain) return false;
  if (clean(item?.entityType, 80) !== candidate.entityType) return false;
  return entityKey(item?.nameHint) === entityKey(candidate.name);
}

function recomputeCounts(inventory, domains) {
  return {
    ...inventory.counts,
    deterministicDomains: domains.filter((domain) => domain.expectationState === "DETERMINISTIC").length,
    conflictingDomains: domains.filter((domain) => domain.expectationState === "CONFLICT").length,
    unknownExpectationDomains: domains.filter((domain) => domain.expectationState === "UNKNOWN").length,
    expectedItems: domains.reduce((sum, domain) => sum + Number(domain.expectedCount || 0), 0),
  };
}

export function reconcileHotelInventoryWithVerifiedFactsV2(inventory = {}, facts = [], options = {}) {
  const ingestedDocumentUrls = new Set(unique(options.ingestedDocumentUrls || []));
  if (!ingestedDocumentUrls.size || !Array.isArray(facts) || !facts.length) return inventory;

  const additionsByDomain = new Map();

  for (const fact of facts) {
    if (!eligibleFact(fact) || !sourceIsIngestedDocument(fact, ingestedDocumentUrls)) continue;
    const sourceUrls = factSources(fact).filter((url) => ingestedDocumentUrls.has(url));
    if (!sourceUrls.length) continue;

    for (const candidate of candidatesFromFact(fact)) {
      if (!additionsByDomain.has(candidate.domain)) additionsByDomain.set(candidate.domain, []);
      additionsByDomain.get(candidate.domain).push({
        candidate,
        sourceUrls,
      });
    }
  }

  const domains = (Array.isArray(inventory.domains) ? inventory.domains : []).map((domain) => {
    const additions = additionsByDomain.get(domain.domain) || [];
    if (!additions.length) return domain;

    const expectedItems = Array.isArray(domain.expectedItems) ? [...domain.expectedItems] : [];
    const detailUrls = [...(domain.detailUrls || [])];
    const supportingUrls = [...(domain.supportingUrls || [])];
    let changed = false;

    for (const { candidate, sourceUrls } of additions) {
      if (expectedItems.some((item) => sameCandidate(item, candidate))) {
        supportingUrls.push(...sourceUrls);
        continue;
      }

      const key = entityKey(candidate.name);
      const primaryUrl = sourceUrls[0] || "";
      expectedItems.push({
        id: `${candidate.domain}:verified-document:${key}`,
        domain: candidate.domain,
        entityType: candidate.entityType,
        variantGroupId: `verified-document:${key}`,
        nameHint: candidate.name,
        url: primaryUrl,
        urls: sourceUrls,
        languages: [],
        crawled: false,
        basis: "canonical_verified_document_entity",
      });
      supportingUrls.push(...sourceUrls);
      changed = true;
    }

    if (!changed) {
      return {
        ...domain,
        supportingUrls: unique(supportingUrls).sort(),
      };
    }

    return {
      ...domain,
      expectationState: domain.expectationState === "CONFLICT" ? "CONFLICT" : "DETERMINISTIC",
      expectedCount: expectedItems.length,
      expectedItems,
      detailUrls: unique(detailUrls).sort(),
      supportingUrls: unique(supportingUrls).sort(),
      issues: [...new Set([...(domain.issues || []), "verified_document_inventory_reconciliation"])],
      evidence: {
        ...(domain.evidence || {}),
        verifiedDocumentCount: expectedItems.filter((item) => item.basis === "canonical_verified_document_entity").length,
      },
    };
  });

  return {
    ...inventory,
    domains,
    counts: recomputeCounts(inventory, domains),
  };
}
