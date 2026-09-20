import { buildHotelSiteGraphV3 } from "./hotel-scanner-v3-site-graph.mjs";
import { detectHotelStructuralListsV3 } from "./hotel-scanner-v3-list-detector.mjs";
import { buildHotelPageFamiliesV3, hotelScannerV3FamilyLeafMembers } from "./hotel-scanner-v3-page-families.mjs";

function pageRole(url, families) {
  const sourceFamilies = families.filter((family) => family.sourceUrl === url);
  const targetFamilies = families.filter((family) => family.members.some((member) => member.url === url));
  if (sourceFamilies.length && targetFamilies.length) return "HYBRID";
  if (sourceFamilies.length) return "LIST";
  if (targetFamilies.length) return "DETAIL";
  return "CONTENT";
}

export function buildHotelStructuralInventoryGraphV3(evidence = {}) {
  const graph = buildHotelSiteGraphV3(evidence);
  const structuralLists = detectHotelStructuralListsV3(evidence);
  const families = buildHotelPageFamiliesV3(graph, structuralLists);
  const leafMembers = hotelScannerV3FamilyLeafMembers(families);

  const roles = graph.nodes.map((node) => ({
    url: node.url,
    role: pageRole(node.url, families),
  }));

  const familyClosure = families.map((family) => {
    const total = family.members.length;
    const fetched = family.members.filter((member) => member.crawled).length;
    return {
      familyId: family.id,
      sourceUrl: family.sourceUrl,
      totalMembers: total,
      fetchedMembers: fetched,
      unresolvedMembers: Math.max(0, total - fetched),
      closed: total > 0 && fetched === total,
    };
  });

  return {
    schemaVersion: "hotel-scanner-v3-structural-inventory-1",
    graph,
    structuralLists,
    families,
    leafMembers,
    roles,
    closure: {
      families: familyClosure,
      closedFamilies: familyClosure.filter((item) => item.closed).length,
      openFamilies: familyClosure.filter((item) => !item.closed).length,
      unresolvedMembers: familyClosure.reduce((sum, item) => sum + item.unresolvedMembers, 0),
    },
    counts: {
      pageFamilies: families.length,
      structuralLists: structuralLists.length,
      leafEntities: leafMembers.length,
      duplicateLabelsAcrossFamilies: (() => {
        const labelFamilies = new Map();
        for (const member of leafMembers) {
          const label = String(member.label || "").toLocaleLowerCase("en-US").trim();
          if (!label) continue;
          if (!labelFamilies.has(label)) labelFamilies.set(label, new Set());
          labelFamilies.get(label).add(member.familyId);
        }
        return [...labelFamilies.values()].filter((set) => set.size > 1).length;
      })(),
    },
  };
}
