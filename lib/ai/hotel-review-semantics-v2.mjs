export const HOTEL_REVIEW_SEMANTIC_KINDS = [
  "conflict",
  "coverage_gap",
  "invalid_value",
  "profile_evidence_mismatch",
  "technology_ambiguity",
  "human_enrichment",
];

const COVERAGE_GAP_STATES = new Set([
  "NOT_CRAWLED",
  "NOT_DISCOVERED",
  "PARTIAL",
  "REVIEW_REQUIRED",
]);

const TECHNOLOGY_AMBIGUOUS_STATES = new Set([
  "LIKELY",
  "UNKNOWN",
  "NOT PUBLICLY EVIDENCED",
]);

function text(value, max = 2_000) {
  const normalized = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

function keyText(value) {
  return text(value).toLocaleLowerCase("en-US");
}

function unique(values, max = 40) {
  const result = [];
  const seen = new Set();
  for (const raw of values || []) {
    const value = text(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= max) break;
  }
  return result;
}

function issueId(kind, rawKey) {
  const suffix = keyText(rawKey)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "unknown";
  return `review-v2:${kind}:${suffix}`;
}

function pushUnique(issues, seen, issue) {
  const key = `${issue.kind}|${issue.domain || ""}|${keyText(issue.subject)}|${keyText(issue.detail)}`;
  if (seen.has(key)) return;
  seen.add(key);
  issues.push(issue);
}

function conflictIssues(input, issues, seen) {
  for (const conflict of Array.isArray(input?.conflicts) ? input.conflicts : []) {
    const subject = text(conflict?.topicLabel || conflict?.topic || "Conflict", 240);
    const values = unique((conflict?.claims || []).map((claim) => claim?.value), 8);
    pushUnique(issues, seen, {
      id: issueId("conflict", conflict?.id || conflict?.topic || subject),
      kind: "conflict",
      state: "CONFLICT",
      subject,
      detail: values.length ? values.join(" ↔ ") : "Conflicting supported evidence requires human review.",
      sourceUrls: unique(conflict?.sourceUrls || [], 12),
      requiresHumanReview: true,
    });
  }
}

function coverageGapIssues(input, issues, seen) {
  const domains = Array.isArray(input?.coverage?.domains) ? input.coverage.domains : [];
  for (const entry of domains) {
    const state = text(entry?.state, 80);
    if (!COVERAGE_GAP_STATES.has(state)) continue;
    const domain = text(entry?.domain, 120);
    const candidates = unique(entry?.notCrawledCandidateUrls || [], 8);
    const detail = state === "NOT_CRAWLED"
      ? (candidates.length
        ? `Relevant candidate pages were discovered but not crawled: ${candidates.join(", ")}`
        : "The bounded scan did not crawl evidence for this domain.")
      : state === "NOT_DISCOVERED"
        ? "The scanned public evidence did not produce a supported discovery for this domain."
        : state === "PARTIAL"
          ? "Only part of the expected domain evidence was discovered."
          : "This domain remains explicitly marked for review.";

    pushUnique(issues, seen, {
      id: issueId("coverage_gap", `${domain}:${state}`),
      kind: "coverage_gap",
      state,
      domain,
      subject: domain || "coverage",
      detail,
      sourceUrls: unique(entry?.scannedUrls || [], 12),
      candidateUrls: candidates,
      requiresHumanReview: state !== "NOT_CRAWLED",
    });
  }
}

function invalidValueIssues(input, issues, seen) {
  for (const invalid of Array.isArray(input?.invalidValues) ? input.invalidValues : []) {
    const path = text(invalid?.path, 240);
    const subject = text(invalid?.label || path || "Invalid value", 240);
    pushUnique(issues, seen, {
      id: issueId("invalid_value", `${path}:${invalid?.reason || subject}`),
      kind: "invalid_value",
      state: "INVALID",
      domain: text(invalid?.category, 120),
      subject,
      detail: text(invalid?.reason || "invalid_value", 500),
      observedValue: text(invalid?.value, 1_000),
      sourceUrls: [],
      requiresHumanReview: true,
    });
  }
}

function mismatchIssues(input, issues, seen) {
  const reconciliationIssues = Array.isArray(input?.reconciliation?.issues)
    ? input.reconciliation.issues
    : [];
  for (const mismatch of reconciliationIssues) {
    if (mismatch?.kind === "evidence_conflict") continue;
    const field = text(mismatch?.field || mismatch?.topic || "profile", 240);
    const unsupported = unique(mismatch?.unsupportedProfileValues || [], 12);
    const evidenceOnly = unique((mismatch?.evidenceValues || []).map((value) => (
      typeof value === "object" && value !== null ? value.value : value
    )), 12);
    const detailParts = [];
    if (unsupported.length) detailParts.push(`Unsupported profile values: ${unsupported.join(", ")}`);
    if (evidenceOnly.length) detailParts.push(`Evidence-only values: ${evidenceOnly.join(", ")}`);
    if (!detailParts.length) detailParts.push(text(mismatch?.kind || "profile_evidence_mismatch", 240));

    pushUnique(issues, seen, {
      id: issueId("profile_evidence_mismatch", `${mismatch?.kind || "mismatch"}:${field}`),
      kind: "profile_evidence_mismatch",
      state: "MISMATCH",
      subject: field,
      detail: detailParts.join("; "),
      sourceUrls: unique((mismatch?.evidenceValues || []).flatMap((value) => value?.sourceUrls || []), 12),
      requiresHumanReview: true,
    });
  }
}

function technologyCapabilityEntries(technologyDiscovery) {
  const capabilities = technologyDiscovery?.capabilities || {};
  return [
    ["booking_technology", capabilities.bookingTechnology],
    ["guest_account_portal", capabilities.guestAccountPortal],
    ["operational_guest_hub", capabilities.operationalGuestHub],
    ["public_web_app_surface", capabilities.publicWebAppSurface],
  ];
}

function technologyAmbiguityIssues(input, issues, seen) {
  const technology = input?.technologyDiscovery;
  if (!technology || technology?.schemaVersion !== "hotel-technology-discovery-v1") return;

  for (const [capability, value] of technologyCapabilityEntries(technology)) {
    const classification = text(value?.classification, 80);
    if (!TECHNOLOGY_AMBIGUOUS_STATES.has(classification)) continue;
    const sourceUrls = unique([
      ...(value?.urls || []),
      ...(value?.manifestUrls || []),
      ...(value?.serviceWorkerUrls || []),
      ...(value?.evidence || []).map((item) => item?.sourceUrl),
    ], 12);
    pushUnique(issues, seen, {
      id: issueId("technology_ambiguity", `${capability}:${classification}`),
      kind: "technology_ambiguity",
      state: classification,
      domain: "technology",
      subject: capability,
      detail: text(value?.note || `Technology capability is classified as ${classification}.`, 1_000),
      sourceUrls,
      requiresHumanReview: classification === "LIKELY",
    });
  }
}

function humanEnrichmentIssues(input, issues, seen) {
  const conflictNoteKeys = new Set((input?.conflictNotes || []).map(keyText));
  const uncertainties = Array.isArray(input?.profile?.uncertainties) ? input.profile.uncertainties : [];
  for (const raw of uncertainties) {
    const note = text(raw, 1_000);
    if (!note || conflictNoteKeys.has(keyText(note))) continue;
    pushUnique(issues, seen, {
      id: issueId("human_enrichment", note),
      kind: "human_enrichment",
      state: "NEEDS_HUMAN_INPUT",
      subject: "scanner_uncertainty",
      detail: note,
      sourceUrls: [],
      requiresHumanReview: true,
    });
  }

  const reviewItems = Array.isArray(input?.humanReview?.items) ? input.humanReview.items : [];
  for (const item of reviewItems) {
    if (item?.origin !== "manual" && item?.decision !== "corrected") continue;
    const subject = text(item?.label || item?.id || "human enrichment", 240);
    const detail = text(item?.effectiveValue || item?.reviewerNote || item?.scannerValue, 1_000);
    pushUnique(issues, seen, {
      id: issueId("human_enrichment", item?.id || `${subject}:${detail}`),
      kind: "human_enrichment",
      state: item?.origin === "manual" ? "HUMAN_ADDED" : "HUMAN_CORRECTED",
      domain: text(item?.category, 120),
      subject,
      detail,
      sourceUrls: unique(item?.sourceUrls || [], 12),
      requiresHumanReview: item?.decision === "pending",
    });
  }
}

export function buildHotelReviewSemanticsV2(input = {}) {
  const issues = [];
  const seen = new Set();

  conflictIssues(input, issues, seen);
  coverageGapIssues(input, issues, seen);
  invalidValueIssues(input, issues, seen);
  mismatchIssues(input, issues, seen);
  technologyAmbiguityIssues(input, issues, seen);
  humanEnrichmentIssues(input, issues, seen);

  return {
    schemaVersion: "hotel-review-semantics-v2",
    authority: {
      kind: "review_projection_only",
      persistenceAuthority: false,
      lifecycleReadinessAuthority: false,
      approvalAuthority: false,
    },
    kinds: [...HOTEL_REVIEW_SEMANTIC_KINDS],
    issues,
    counts: Object.fromEntries(HOTEL_REVIEW_SEMANTIC_KINDS.map((kind) => [
      kind,
      issues.filter((issue) => issue.kind === kind).length,
    ])),
    requiresHumanReviewCount: issues.filter((issue) => issue.requiresHumanReview).length,
  };
}
