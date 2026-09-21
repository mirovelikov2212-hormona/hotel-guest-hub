import { canonicalizeHotelIntakeUrl } from "./hotel-scanner-v2-site-map.mjs";
import { hotelScannerV3ParentPathKey, hotelScannerV3PathSegments } from "./hotel-scanner-v3-site-graph.mjs";

function clean(value, max = 500) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, max);
}

function slug(value) {
  return clean(value, 500)
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
}

function familyId(sourceUrl, heading, index) {
  const source = slug(sourceUrl.replace(/^https?:\/\//iu, ""));
  const name = slug(heading) || `list-${index}`;
  return `family:${source}:${name}`;
}

function identityKey(family, item, index) {
  const label = slug(item?.label);
  const url = canonicalizeHotelIntakeUrl(item?.url || "");
  const inlineKey = clean(item?.inlineKey, 120);
  return `${family.id}|${url || inlineKey || label || index}`;
}

function linkedMemberSet(family) {
  return new Set((family?.members || []).map((member) => canonicalizeHotelIntakeUrl(member?.url || "")).filter(Boolean));
}

function isStrictSubset(left, right) {
  return left.size > 0 && left.size < right.size && [...left].every((value) => right.has(value));
}

function sameSet(left, right) {
  return left.size === right.size && left.size > 0 && [...left].every((value) => right.has(value));
}

function sourceDepth(family) {
  return hotelScannerV3PathSegments(family?.sourceUrl || "").length;
}

function collapseRedundantLinkedFamilies(families) {
  const keep = new Array(families.length).fill(true);
  const sets = families.map(linkedMemberSet);

  for (let i = 0; i < families.length; i += 1) {
    if (!keep[i] || sets[i].size < 2) continue;
    for (let j = 0; j < families.length; j += 1) {
      if (i === j || !keep[j] || sets[j].size < 2) continue;

      if (isStrictSubset(sets[i], sets[j])) {
        keep[i] = false;
        break;
      }

      if (sameSet(sets[i], sets[j])) {
        const left = families[i];
        const right = families[j];
        const rightPreferred = sourceDepth(right) < sourceDepth(left)
          || (sourceDepth(right) === sourceDepth(left) && Number(right.confidence || 0) > Number(left.confidence || 0))
          || (sourceDepth(right) === sourceDepth(left)
            && Number(right.confidence || 0) === Number(left.confidence || 0)
            && String(right.id).localeCompare(String(left.id)) < 0);
        if (rightPreferred) {
          keep[i] = false;
          break;
        }
      }
    }
  }

  return families.filter((_, index) => keep[index]);
}

export function buildHotelPageFamiliesV3(graph = {}, structuralLists = []) {
  const graphNodes = new Map((graph.nodes || []).map((node) => [node.url, node]));
  const families = [];

  for (let index = 0; index < structuralLists.length; index += 1) {
    const list = structuralLists[index];
    const sourceUrl = canonicalizeHotelIntakeUrl(list?.sourceUrl || "");
    if (!sourceUrl) continue;

    const id = familyId(sourceUrl, list?.heading, index);
    const family = {
      id,
      sourceUrl,
      sourceTitle: clean(list?.sourceTitle, 240),
      heading: clean(list?.heading, 240),
      sectionPath: Array.isArray(list?.sectionPath) ? list.sectionPath.map((item) => clean(item, 240)).filter(Boolean) : [],
      confidence: Number(list?.confidence || 0),
      relation: "CONTENT_LIST",
      evidenceSource: clean(list?.evidence?.source, 80),
      fingerprint: clean(list?.evidence?.fingerprint, 80),
      parentFingerprint: clean(list?.evidence?.parentFingerprint, 80),
      members: [],
    };

    for (let memberIndex = 0; memberIndex < (list?.items || []).length; memberIndex += 1) {
      const item = list.items[memberIndex];
      const rawUrl = clean(item?.url, 2_048);
      const url = rawUrl ? canonicalizeHotelIntakeUrl(rawUrl, sourceUrl) : "";
      const inlineKey = clean(item?.inlineKey, 120);
      const label = clean(item?.label, 240);
      if (!url && !inlineKey) continue;
      const node = url ? graphNodes.get(url) : null;
      const member = {
        url,
        inlineKey,
        label,
        memberMode: url ? "linked" : "inline",
        crawled: url ? Boolean(node?.crawled) : true,
        parentPathKey: url ? hotelScannerV3ParentPathKey(url) : "",
        pathSegments: url ? hotelScannerV3PathSegments(url) : [],
      };
      member.identityKey = identityKey(family, member, memberIndex);
      family.members.push(member);
    }

    if (family.members.length >= 2) families.push(family);
  }

  return collapseRedundantLinkedFamilies(families).sort((a, b) =>
    b.confidence - a.confidence
    || b.members.length - a.members.length
    || a.id.localeCompare(b.id));
}

export function hotelScannerV3FamilyLeafMembers(families = []) {
  const sourceUrls = new Set(families.map((family) => family.sourceUrl));
  const result = [];
  for (const family of families) {
    for (const member of family.members || []) {
      if (member.url && sourceUrls.has(member.url)) continue;
      result.push({ ...member, familyId: family.id, familyHeading: family.heading });
    }
  }
  return result;
}
