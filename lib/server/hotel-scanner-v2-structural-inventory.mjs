const SUPPORTED_DOMAINS = new Set(["accommodation", "gastronomy"]);

const SECTION_SIGNAL = Object.freeze({
  accommodation: /(?:rooms?|suites?|accommodation|stay|lodging|zimmer|suiten?|unterkunft|camere|apartamente|pokoje|apartm[aá]ny|стаи|апартаменти|настаняване)/iu,
  gastronomy: /(?:gastronomy|dining|restaurants?|bars?|food\s*&\s*drink|taste|culinary|restaurant|bar|гастрономия|ресторанти|барове|хранене|gastronomie|restaurants?|bars?|restaurante|baruri|restaurace|bary)/iu,
});

const NEGATIVE = Object.freeze({
  accommodation: /(?:offer|package|promotion|discount|special|christmas|new year|independence|book\s+\d|free night|оферта|пакет|промо|коледа|нова година|weihnacht|angebot|paket)/iu,
  gastronomy: /(?:policy|privacy|terms|newsletter|stay informed|about the hotel|hotelrichtlinien|richtlinie|gdpr|data protection|политик|поверителност|условия)/iu,
});

const ROOM_STRONG = /(?:\b\d+(?:[.,]\d+)?\s*(?:m²|m2|sq\.?\s*m|sqm)\b|\b\d+(?:\+\d+)?\s*(?:guests?|persons?|people|гости|personen)\b|\b(?:king|queen|double|twin|single)\s+bed\b|\b(?:one|two|three|four|single|double)\s+bedrooms?\b|\b(?:sleeps?|occupancy|capacity)\s*(?:up to|max(?:imum)?\s*)?\d+\b)/iu;
const ROOM_HEADING = /(?:\broom\b|\bsuite\b|\bstudio\b|\bapartment\b|\bzimmer\b|\bappartement\b|\bcamer[ăa]\b|\bapartament\b|\bpokoj\b|\bapartm[aá]n\b|\bстая\b|\bстудио\b|\bапартамент\b|\bномер\b)/iu;
const DINING_STRONG = /(?:restaurant|bar|cafe|café|bistro|dining|cuisine|menu|breakfast|lunch|dinner|cocktail|wine|gourmet|buffet|ресторант|бар|кафе|кухня|меню|закуска|обяд|вечеря|gastronomie|speisekarte|küche|restaurante?|baruri|restaurace|bary)/iu;

const GENERIC = /^(?:home|overview|about|discover|read more|learn more|view more|our rooms(?:\s*&\s*suites)?|rooms(?:\s*&\s*suites)?|accommodation|accommodations|stay|gastronomy|our dining venues|dining venues|food\s*&\s*drink|taste\s*&\s*pleasure|restaurants?\s*&?\s*bars?|начало|настаняване|гастрономия|ресторанти\s*и\s*барове)$/iu;

function clean(value, max = 500) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function key(value) {
  return clean(value, 240).toLocaleLowerCase("en-US").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function primaryDomain(classification) {
  const type = clean(classification?.primaryType, 80);
  if (type === "accommodation" || type === "room_detail") return "accommodation";
  if (type === "gastronomy" || type === "restaurant_detail") return "gastronomy";
  return "";
}

function isParentBlock(block, blocks) {
  const headingKey = key(block?.heading);
  if (!headingKey) return false;
  return blocks.some((candidate) => {
    if (candidate === block || Number(candidate?.level || 0) <= Number(block?.level || 0)) return false;
    return (candidate?.sectionPath || []).some((heading) => key(heading) === headingKey);
  });
}

function nearestDomainSection(block, domain) {
  const pattern = SECTION_SIGNAL[domain];
  const path = Array.isArray(block?.sectionPath) ? block.sectionPath : [];
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const heading = clean(path[index], 240);
    if (pattern?.test(heading)) return heading;
  }
  return "";
}

function candidateEvidence(block, domain, pagePrimaryDomain) {
  const heading = clean(block?.heading, 240);
  const text = clean(block?.text, 2_000);
  const combined = `${heading} ${text}`;
  if (!heading || GENERIC.test(heading) || NEGATIVE[domain]?.test(combined)) return null;

  const section = nearestDomainSection(block, domain);
  const inAuthoritativeSection = Boolean(section) || pagePrimaryDomain === domain;
  if (!inAuthoritativeSection) return null;

  if (domain === "accommodation") {
    const metric = ROOM_STRONG.test(combined);
    const semantic = ROOM_HEADING.test(heading);
    if (!metric && !semantic) return null;
    return { score: (metric ? 8 : 0) + (semantic ? 4 : 0) + (section ? 4 : 0), section };
  }

  if (domain === "gastronomy") {
    const semantic = DINING_STRONG.test(combined);
    if (!semantic) return null;
    return { score: 7 + (DINING_STRONG.test(heading) ? 3 : 0) + (section ? 4 : 0), section };
  }

  return null;
}

function groupKey(block, domain, section) {
  const path = Array.isArray(block?.sectionPath) ? block.sectionPath : [];
  const relevantSection = section || path[path.length - 1] || domain;
  return `${Number(block?.level || 0)}|${key(relevantSection) || domain}`;
}

function uniqueCandidates(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const name = clean(value?.name, 240);
    const candidateKey = key(name);
    if (!candidateKey || seen.has(candidateKey)) continue;
    seen.add(candidateKey);
    result.push({ ...value, name });
  }
  return result;
}

export function deriveHotelStructuralInventoryV2(page = {}, classification = {}) {
  const domain = primaryDomain(classification);
  if (!SUPPORTED_DOMAINS.has(domain)) return null;
  const blocks = Array.isArray(page?.contentBlocks) ? page.contentBlocks : [];
  if (!blocks.length) return null;

  const groups = new Map();
  for (const block of blocks) {
    if (isParentBlock(block, blocks)) continue;
    const evidence = candidateEvidence(block, domain, domain);
    if (!evidence) continue;
    const group = groupKey(block, domain, evidence.section);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({
      name: clean(block?.heading, 240),
      entityType: domain === "accommodation" ? "room_type" : "venue",
      basis: "structural_leaf_block",
      score: evidence.score,
      links: Array.isArray(block?.links) ? block.links.slice(0, 8) : [],
      section: evidence.section,
      level: Number(block?.level || 0),
    });
  }

  const ranked = [...groups.entries()].map(([group, values]) => {
    const candidates = uniqueCandidates(values).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
    return {
      group,
      candidates,
      score: candidates.reduce((sum, candidate) => sum + candidate.score, 0) + candidates.length * 10,
    };
  }).filter((entry) => entry.candidates.length)
    .sort((left, right) => right.candidates.length - left.candidates.length || right.score - left.score || left.group.localeCompare(right.group));

  if (!ranked.length) return null;
  const winner = ranked[0];
  return {
    domain,
    expectedCount: winner.candidates.length,
    identifiedCount: winner.candidates.length,
    candidates: winner.candidates,
    basis: "structural_leaf_cluster",
    confidence: winner.candidates.length >= 2 ? "HIGH" : "MEDIUM",
    sectionGroup: winner.group,
  };
}
