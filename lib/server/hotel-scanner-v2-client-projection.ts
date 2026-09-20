import "server-only";

import type { HotelIntakePipelineV2Result } from "@/lib/server/hotel-scanner-v2-pipeline";

type LooseRecord = Record<string, any>;

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function compactSourceUrls(value: unknown) {
  return list(value).map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 4);
}

function compactMissingItems(value: unknown) {
  return list(value).map((item: LooseRecord) => ({
    id: String(item?.id || ""),
    nameHint: String(item?.nameHint || ""),
    url: String(item?.url || ""),
    crawled: Boolean(item?.crawled),
  }));
}

function compactCompleteness(result: LooseRecord) {
  const completeness = result?.completeness || {};
  return {
    status: completeness.status,
    domains: list(completeness.domains).map((domain: LooseRecord) => ({
      domain: domain.domain,
      status: domain.status,
      reason: domain.reason,
      expected: domain.expected,
      extracted: domain.extracted,
      blocking: domain.blocking,
      missingItems: compactMissingItems(domain.missingItems),
      inventory: domain.inventory ? {
        status: domain.inventory.status,
        reason: domain.inventory.reason,
        expected: domain.inventory.expected,
        extracted: domain.inventory.extracted,
        missingItems: compactMissingItems(domain.inventory.missingItems),
      } : undefined,
      content: domain.content ? {
        status: domain.content.status,
        reason: domain.content.reason,
        detailed: domain.content.detailed,
        totalEntities: domain.content.totalEntities,
        missingDetailItems: compactMissingItems(domain.content.missingDetailItems),
      } : undefined,
    })),
    documents: completeness.documents,
    conflicts: completeness.conflicts,
    blockingReasons: list(completeness.blockingReasons),
  };
}

function compactReviewSections(result: LooseRecord) {
  return list(result?.reviewSections).map((section: LooseRecord) => ({
    domain: section.domain,
    expectedCount: section.expectedCount,
    cardCount: section.cardCount,
    verifiedCount: section.verifiedCount,
    conflictCount: section.conflictCount,
    missingCount: section.missingCount,
    cards: list(section.cards).map((card: LooseRecord) => ({
      id: card.id,
      domain: card.domain,
      entityType: card.entityType,
      name: card.name,
      status: card.status,
      sourceUrls: compactSourceUrls(card.sourceUrls),
      attributes: list(card.attributes).slice(0, 7).map((attribute: LooseRecord) => ({
        attribute: attribute.attribute,
        label: attribute.label,
        value: attribute.value,
        verificationStatus: attribute.verificationStatus,
        independentSourceCount: attribute.independentSourceCount,
        sourceUrls: compactSourceUrls(attribute.sourceUrls),
      })),
      conflicts: list(card.conflicts).map((conflict: LooseRecord) => ({
        attribute: conflict.attribute,
        claims: list(conflict.claims).map((claim: LooseRecord) => ({
          value: claim.value,
          sourceUrls: compactSourceUrls(claim.sourceUrls),
        })),
      })),
    })),
  }));
}

function compactConflicts(result: LooseRecord) {
  return list(result?.intelligenceCandidate?.conflicts).map((conflict: LooseRecord) => ({
    id: conflict.id,
    topic: conflict.topic,
    topicLabel: conflict.topicLabel,
    subject: conflict.subject,
    attribute: conflict.attribute,
    state: conflict.state,
    sourceUrls: compactSourceUrls(conflict.sourceUrls),
    claims: list(conflict.claims).map((claim: LooseRecord) => ({
      category: claim.category,
      label: claim.label,
      value: claim.value,
      canonicalValue: claim.canonicalValue,
      sourceUrls: compactSourceUrls(claim.sourceUrls),
    })),
  }));
}

export function projectHotelScannerV2ClientResult(result: HotelIntakePipelineV2Result) {
  const value = result as unknown as LooseRecord;
  const candidate = value.intelligenceCandidate || {};

  return {
    pipelineStatus: value.pipelineStatus,
    source: value.source ? { canonicalUrl: value.source.canonicalUrl } : undefined,
    discovery: {
      siteMap: { counts: value.discovery?.siteMap?.counts },
      inventory: { counts: value.discovery?.inventory?.counts },
      coverage: value.discovery?.coverage,
      structuralCrawl: value.discovery?.structuralCrawl,
    },
    canonicalInventory: value.canonicalInventory ? {
      authority: value.canonicalInventory.authority,
      observed: value.canonicalInventory.observed,
      delta: value.canonicalInventory.delta,
      authorityLocked: Boolean(value.canonicalInventory.authorityLocked),
    } : undefined,
    documents: {
      documents: list(value.documents?.documents).map((document: LooseRecord) => ({
        url: document.url,
        status: document.status,
        domains: list(document.domains),
        byteCount: document.byteCount,
        error: document.error,
        factCount: list(document.facts).length,
      })),
    },
    completeness: compactCompleteness(value),
    intelligenceCandidate: {
      // Entity cards are already materialized in reviewSections. Do not ship the
      // large raw fact set or technical inventory back to the browser.
      inventory: { domains: [] },
      facts: [],
      conflicts: compactConflicts(value),
      validation: candidate.validation || {
        status: value.pipelineStatus || "INCOMPLETE",
        downstreamHandoffAllowed: false,
        blockingReasons: list(value.validationGate?.blockingReasons),
      },
    },
    reviewSections: compactReviewSections(value),
    validationGate: value.validationGate,
    diagnostics: { totalLatencyMs: value.diagnostics?.totalLatencyMs },
  };
}
