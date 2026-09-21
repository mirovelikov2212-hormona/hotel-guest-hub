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
      const url = canonicalizeHotelIntakeUrl(item?.url || "", sourceUrl);
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

  return families.sort((a, b) =>
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
