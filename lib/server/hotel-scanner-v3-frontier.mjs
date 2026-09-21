import { canonicalizeHotelIntakeUrl } from "./hotel-scanner-v2-site-map.mjs";
import { buildHotelStructuralInventoryGraphV3 } from "./hotel-scanner-v3-structural-inventory.mjs";
import { hotelScannerV3PathSegments } from "./hotel-scanner-v3-site-graph.mjs";

const LANGUAGE_SEGMENT = /^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt|hr|sk|sl)$/iu;

function clean(value, max = 2_048) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, max);
}

export function hotelScannerV3LogicalUrlKey(rawUrl) {
  const normalized = canonicalizeHotelIntakeUrl(rawUrl);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    const segments = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    if (segments.length && LANGUAGE_SEGMENT.test(segments[0])) segments.shift();
    const path = `/${segments.join("/")}`.replace(/\/$/u, "") || "/";
    return `${url.origin}${path}`;
  } catch {
    return normalized;
  }
}

function coveredState(evidence, attemptedUrls, unavailableUrls) {
  const unavailable = new Set(unavailableUrls.map(hotelScannerV3LogicalUrlKey).filter(Boolean));
  const covered = new Set();

  for (const page of evidence.pages || []) {
    const key = hotelScannerV3LogicalUrlKey(page?.url);
    if (key) covered.add(key);
    const canonical = hotelScannerV3LogicalUrlKey(page?.canonicalHint);
    if (canonical) covered.add(canonical);
    for (const alternate of page?.languageAlternates || []) {
      const alternateKey = hotelScannerV3LogicalUrlKey(alternate?.url);
      if (alternateKey) covered.add(alternateKey);
    }
  }

  for (const raw of attemptedUrls) {
    const key = hotelScannerV3LogicalUrlKey(raw);
    if (key && !unavailable.has(key)) covered.add(key);
  }

  return { covered, unavailable };
}

function sampleIndexes(total, evidenceSource = "") {
  if (total <= 0) return [];
  if (total <= 2) return Array.from({ length: total }, (_, index) => index);

  const desired = evidenceSource === "repeated_dom_siblings"
    ? 2
    : total >= 5
      ? 3
      : 2;

  const indexes = new Set([0, total - 1]);
  if (desired >= 3) indexes.add(Math.floor((total - 1) / 2));
  return [...indexes].sort((a, b) => a - b);
}

function familyAdaptiveState(family, sourceFamilyUrls, covered, unavailable) {
  const members = family.members || [];
  const linkedIndexes = members
    .map((member, index) => member?.url ? index : -1)
    .filter((index) => index >= 0);
  const inlineIndexes = members
    .map((member, index) => !member?.url && member?.inlineKey ? index : -1)
    .filter((index) => index >= 0);

  const memberKeys = members.map((member) => hotelScannerV3LogicalUrlKey(member?.url));
  const expandedMemberIndexes = linkedIndexes
    .filter((index) => sourceFamilyUrls.has(memberKeys[index]));

  if (!linkedIndexes.length && inlineIndexes.length) {
    return {
      familyId: family.id,
      sourceUrl: family.sourceUrl,
      confidence: Number(family.confidence || 0),
      evidenceSource: clean(family.evidenceSource, 80),
      totalMembers: members.length,
      mode: "INLINE_TERMINAL",
      sampleIndexes: [],
      expandedMemberIndexes: [],
      requiredMemberCount: 0,
      verifiedRequiredMembers: 0,
      pendingRequiredMembers: 0,
      blockedRequiredMembers: 0,
      inferredLeafMembers: inlineIndexes.length,
      inlineMembers: inlineIndexes.length,
      status: "CLOSED_INLINE",
      pending: [],
    };
  }

  const expandAll = expandedMemberIndexes.length > 0;
  const samplePositions = sampleIndexes(linkedIndexes.length, family.evidenceSource);
  const sample = samplePositions.map((position) => linkedIndexes[position]).filter((index) => index !== undefined);
  const requiredIndexes = expandAll ? linkedIndexes : sample;

  const required = requiredIndexes.map((index) => ({
    index,
    member: members[index],
    key: memberKeys[index],
  })).filter((item) => item.member && item.key);

  const pending = required.filter((item) => !covered.has(item.key) && !unavailable.has(item.key));
  const blocked = required.filter((item) => unavailable.has(item.key));
  const verified = required.filter((item) => covered.has(item.key));
  const inferredLinkedLeafMembers = expandAll
    ? linkedIndexes.filter((index) => !expandedMemberIndexes.includes(index)).length
    : linkedIndexes.filter((index) => !requiredIndexes.includes(index)).length;
  const inferredLeafMembers = inlineIndexes.length + inferredLinkedLeafMembers;

  let status = "OPEN_SAMPLE";
  if (expandAll) status = "OPEN_EXPANSION";
  if (!pending.length && blocked.length) status = "BLOCKED";
  else if (!pending.length && expandAll) status = "CLOSED_EXPANDED";
  else if (!pending.length) status = "CLOSED_INFERRED_LEAF";

  return {
    familyId: family.id,
    sourceUrl: family.sourceUrl,
    confidence: Number(family.confidence || 0),
    evidenceSource: clean(family.evidenceSource, 80),
    totalMembers: members.length,
    mode: expandAll ? "EXPAND_ALL" : "SAMPLE_TERMINALITY",
    sampleIndexes: sample,
    expandedMemberIndexes,
    requiredMemberCount: required.length,
    verifiedRequiredMembers: verified.length,
    pendingRequiredMembers: pending.length,
    blockedRequiredMembers: blocked.length,
    inferredLeafMembers,
    inlineMembers: inlineIndexes.length,
    status,
    pending,
  };
}

function familyFrontier(inventory, covered, unavailable) {
  const sourceFamilyUrls = new Set(
    (inventory.families || []).map((family) => hotelScannerV3LogicalUrlKey(family.sourceUrl)).filter(Boolean),
  );
  const states = (inventory.families || []).map((family) =>
    familyAdaptiveState(family, sourceFamilyUrls, covered, unavailable));

  const byUrl = new Map();
  for (const state of states) {
    for (const item of state.pending) {
      const url = canonicalizeHotelIntakeUrl(item.member?.url);
      if (!url) continue;
      const key = hotelScannerV3LogicalUrlKey(url);
      const score = Math.round(
        10_000
        + state.confidence * 1_000
        + (state.mode === "EXPAND_ALL" ? 500 : 250)
        + Math.min(200, state.totalMembers),
      );
      const existing = byUrl.get(key);
      if (!existing || score > existing.score) {
        byUrl.set(key, {
          url,
          key,
          score,
          reason: state.mode === "EXPAND_ALL" ? "family_expansion" : "family_sample",
          familyIds: [state.familyId],
        });
      } else if (!existing.familyIds.includes(state.familyId)) {
        existing.familyIds.push(state.familyId);
      }
    }
  }

  const candidates = [...byUrl.values()]
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));

  return { states, candidates };
}

function relativeSegments(canonicalUrl, rawUrl) {
  const root = hotelScannerV3PathSegments(canonicalUrl);
  const target = hotelScannerV3PathSegments(rawUrl);
  let index = 0;
  while (index < root.length && index < target.length && root[index] === target[index]) index += 1;
  return target.slice(index);
}

function discoveryCandidateScore(kind, relativeDepth) {
  const base = kind === "navigation"
    ? 900
    : kind === "entry_content"
      ? 820
      : kind === "sitemap_branch"
        ? 720
        : kind === "page_content"
          ? 650
          : 600;
  return base + Math.max(0, 80 - relativeDepth * 10);
}

function buildDiscoveryCandidates(evidence, covered, unavailable, managedFamilyKeys, familySourceKeys) {
  const canonicalUrl = canonicalizeHotelIntakeUrl(evidence.canonicalUrl || evidence.requestedUrl || "");
  const candidates = new Map();

  const add = (rawUrl, kind) => {
    const url = canonicalizeHotelIntakeUrl(rawUrl, canonicalUrl);
    const key = hotelScannerV3LogicalUrlKey(url);
    if (!url || !key || covered.has(key) || unavailable.has(key) || managedFamilyKeys.has(key)) return;
    let parsed;
    try { parsed = new URL(url); } catch { return; }
    try {
      if (canonicalUrl && parsed.origin !== new URL(canonicalUrl).origin) return;
    } catch {
      return;
    }
    const relative = relativeSegments(canonicalUrl, url);
    const score = discoveryCandidateScore(kind, relative.length);
    const existing = candidates.get(key);
    if (!existing || score > existing.score) candidates.set(key, { url, key, score, reason: kind });
  };

  for (const raw of evidence.discovery?.navigationUrls || []) add(raw, "navigation");

  const entryKeys = new Set([
    hotelScannerV3LogicalUrlKey(evidence.requestedUrl),
    hotelScannerV3LogicalUrlKey(evidence.canonicalUrl),
  ].filter(Boolean));
  for (const page of evidence.pages || []) {
    const pageKey = hotelScannerV3LogicalUrlKey(page?.url);
    const pageRelativeDepth = relativeSegments(canonicalUrl, page?.url).length;
    if (entryKeys.has(pageKey)) {
      for (const raw of page?.contentLinks || page?.links || []) add(raw, "entry_content");
      continue;
    }
    if (familySourceKeys.has(pageKey) || pageRelativeDepth > 2) continue;
    let added = 0;
    for (const raw of page?.contentLinks || page?.links || []) {
      if (added >= 8) break;
      const targetDepth = relativeSegments(canonicalUrl, raw).length;
      if (targetDepth > Math.max(3, pageRelativeDepth + 1)) continue;
      add(raw, "page_content");
      added += 1;
    }
  }

  const sitemapByBranch = new Map();
  for (const raw of evidence.discovery?.sitemapPageUrls || []) {
    const url = canonicalizeHotelIntakeUrl(raw, canonicalUrl);
    if (!url) continue;
    const relative = relativeSegments(canonicalUrl, url);
    if (!relative.length) continue;
    const branch = clean(relative[0], 160).toLocaleLowerCase("en-US");
    if (!branch) continue;
    const existing = sitemapByBranch.get(branch);
    if (!existing
      || relative.length < existing.depth
      || (relative.length === existing.depth && url.localeCompare(existing.url) < 0)) {
      sitemapByBranch.set(branch, { url, depth: relative.length });
    }
  }
  for (const value of sitemapByBranch.values()) add(value.url, "sitemap_branch");

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));
}

export function buildHotelScannerAdaptivePlanV3(evidence = {}, options = {}) {
  const attemptedUrls = Array.isArray(options.attemptedUrls) ? options.attemptedUrls : [];
  const unavailableUrls = Array.isArray(options.unavailableUrls) ? options.unavailableUrls : [];
  const batchLimit = Math.max(1, Math.min(32, Math.trunc(options.batchLimit || 8)));

  const inventory = buildHotelStructuralInventoryGraphV3(evidence);
  const { covered, unavailable } = coveredState(evidence, attemptedUrls, unavailableUrls);
  const families = familyFrontier(inventory, covered, unavailable);
  const managedFamilyKeys = new Set(
    (inventory.families || []).flatMap((family) =>
      (family.members || []).map((member) => hotelScannerV3LogicalUrlKey(member?.url)).filter(Boolean)),
  );
  const familySourceKeys = new Set(
    (inventory.families || []).map((family) => hotelScannerV3LogicalUrlKey(family?.sourceUrl)).filter(Boolean),
  );
  const discoveryCandidates = buildDiscoveryCandidates(
    evidence,
    covered,
    unavailable,
    managedFamilyKeys,
    familySourceKeys,
  );

  const familyCandidates = families.candidates;
  const chosenPool = familyCandidates.length ? familyCandidates : discoveryCandidates;
  const nextBatch = chosenPool.slice(0, batchLimit);

  const hasFamilies = (inventory.families || []).length > 0;
  const openFamilies = families.states.filter((state) =>
    state.status === "OPEN_SAMPLE" || state.status === "OPEN_EXPANSION");
  const blockedFamilies = families.states.filter((state) => state.status === "BLOCKED");
  const closedFamilies = families.states.filter((state) =>
    state.status === "CLOSED_EXPANDED"
    || state.status === "CLOSED_INFERRED_LEAF"
    || state.status === "CLOSED_INLINE");

  let stopReason = "CONTINUE";
  if (!nextBatch.length) {
    if (!hasFamilies) stopReason = "NO_STRUCTURAL_INVENTORY";
    else if (blockedFamilies.length) stopReason = "INVENTORY_BLOCKED";
    else if (!openFamilies.length && !discoveryCandidates.length) stopReason = "INVENTORY_CLOSED";
    else stopReason = "FRONTIER_EXHAUSTED";
  }

  return {
    schemaVersion: "hotel-scanner-v3-adaptive-plan-1",
    stopReason,
    inventoryClosed: stopReason === "INVENTORY_CLOSED",
    hasStructuralInventory: hasFamilies,
    inventory,
    closure: {
      totalFamilies: families.states.length,
      closedFamilies: closedFamilies.length,
      openFamilies: openFamilies.length,
      blockedFamilies: blockedFamilies.length,
      inferredLeafMembers: families.states.reduce((sum, state) => sum + state.inferredLeafMembers, 0),
      pendingRequiredMembers: families.states.reduce((sum, state) => sum + state.pendingRequiredMembers, 0),
      states: families.states.map(({ pending, ...state }) => state),
    },
    frontier: {
      familyCandidates,
      discoveryCandidates,
      nextBatch,
    },
    nextBatch: nextBatch.map((candidate) => candidate.url),
  };
}
