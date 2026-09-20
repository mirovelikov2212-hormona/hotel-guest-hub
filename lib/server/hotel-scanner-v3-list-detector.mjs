import { canonicalizeHotelIntakeUrl } from "./hotel-scanner-v2-site-map.mjs";
import { hotelScannerV3ParentPathKey } from "./hotel-scanner-v3-site-graph.mjs";

function clean(value, max = 500) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, max);
}

function uniqueLinks(items, baseUrl) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    const url = canonicalizeHotelIntakeUrl(item?.href || "", baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({ url, label: clean(item?.text, 240) });
  }
  return result;
}

function commonParentScore(items) {
  const parents = items.map((item) => hotelScannerV3ParentPathKey(item.url)).filter(Boolean);
  if (!parents.length) return 0;
  const counts = new Map();
  for (const parent of parents) counts.set(parent, (counts.get(parent) || 0) + 1);
  const max = Math.max(...counts.values());
  return max / items.length;
}

function sameOrigin(items) {
  const origins = new Set();
  for (const item of items) {
    try { origins.add(new URL(item.url).origin); }
    catch {}
  }
  return origins.size <= 1;
}

function candidateConfidence(items, block) {
  let score = 0;
  if (items.length >= 2) score += 0.25;
  if (items.length >= 4) score += 0.15;
  if (sameOrigin(items)) score += 0.15;
  const parentScore = commonParentScore(items);
  score += Math.min(0.25, parentScore * 0.25);
  if (clean(block?.heading, 240)) score += 0.1;
  if ((block?.sectionPath || []).length) score += 0.1;
  return Math.min(1, Number(score.toFixed(3)));
}

function itemSetKey(sourceUrl, items) {
  return `${sourceUrl}|${items.map((item) => item.url).sort().join("|")}`;
}

function upsertCandidate(store, candidate) {
  const key = itemSetKey(candidate.sourceUrl, candidate.items);
  const existing = store.get(key);
  if (!existing
    || candidate.confidence > existing.confidence
    || (candidate.confidence === existing.confidence
      && candidate.evidence?.source === "repeated_dom_siblings"
      && existing.evidence?.source !== "repeated_dom_siblings")) {
    store.set(key, candidate);
  }
}

export function detectHotelStructuralListsV3(evidence = {}) {
  const candidates = new Map();
  const pages = Array.isArray(evidence.pages) ? evidence.pages : [];

  for (const page of pages) {
    const sourceUrl = canonicalizeHotelIntakeUrl(page?.url || "");
    if (!sourceUrl) continue;

    for (let blockIndex = 0; blockIndex < (page?.contentBlocks || []).length; blockIndex += 1) {
      const block = page.contentBlocks[blockIndex] || {};
      const items = uniqueLinks(block.linkItems, sourceUrl)
        .filter((item) => item.url !== sourceUrl)
        .filter((item) => {
          try { return new URL(item.url).origin === new URL(sourceUrl).origin; }
          catch { return false; }
        });

      if (items.length < 2) continue;

      const confidence = candidateConfidence(items, block);
      if (confidence < 0.45) continue;

      upsertCandidate(candidates, {
        id: `${sourceUrl}#block-${blockIndex}`,
        sourceUrl,
        sourceTitle: clean(page?.title, 240),
        blockIndex,
        heading: clean(block?.heading, 240),
        sectionPath: (Array.isArray(block?.sectionPath) ? block.sectionPath : []).map((item) => clean(item, 240)).filter(Boolean),
        items,
        confidence,
        evidence: {
          repeatedLinkCount: items.length,
          commonParentScore: commonParentScore(items),
          source: "content_block_link_cluster",
        },
      });
    }

    for (let domIndex = 0; domIndex < (page?.v3Structure?.repeatedStructures || []).length; domIndex += 1) {
      const group = page.v3Structure.repeatedStructures[domIndex] || {};
      const items = uniqueLinks((group.items || []).map((item) => ({
        href: item?.url,
        text: item?.label,
      })), sourceUrl)
        .filter((item) => item.url !== sourceUrl)
        .filter((item) => {
          try { return new URL(item.url).origin === new URL(sourceUrl).origin; }
          catch { return false; }
        });
      if (items.length < 2) continue;

      const confidence = Math.max(
        Number(group?.confidence || 0),
        candidateConfidence(items, {}),
      );
      if (confidence < 0.55) continue;

      upsertCandidate(candidates, {
        id: `${sourceUrl}#dom-${domIndex}`,
        sourceUrl,
        sourceTitle: clean(page?.title, 240),
        blockIndex: -1,
        heading: "",
        sectionPath: [],
        items,
        confidence,
        evidence: {
          repeatedLinkCount: items.length,
          commonParentScore: commonParentScore(items),
          source: "repeated_dom_siblings",
          fingerprint: clean(group?.fingerprint, 80),
          parentFingerprint: clean(group?.parentFingerprint, 80),
        },
      });
    }
  }

  return [...candidates.values()].sort((a, b) =>
    b.confidence - a.confidence
    || b.items.length - a.items.length
    || a.id.localeCompare(b.id));
}
