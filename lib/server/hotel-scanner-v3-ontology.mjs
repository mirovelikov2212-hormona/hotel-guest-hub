import {
  classifyHotelScannerPageV2,
  hotelScannerPageTypeDomain,
} from "./hotel-scanner-v2-page-classifier.mjs";
import { canonicalizeHotelIntakeUrl } from "./hotel-scanner-v2-site-map.mjs";

export const HOTEL_SCANNER_V3_OPERATIONAL_DOMAINS = Object.freeze([
  "accommodation",
  "gastronomy",
  "spa",
  "services",
  "experiences",
  "offers",
  "events",
]);

const DOMAIN_SET = new Set(HOTEL_SCANNER_V3_OPERATIONAL_DOMAINS);

const DOMAIN_LEXICON = Object.freeze({
  accommodation: /(?:\baccommodation\b|\brooms?\b|\bsuites?\b|\bvillas?\b|\bapartments?\b|\bstay\b|\bzimmer\b|\bunterkunft\b|\bhabitaci(?:o|ó)nes?\b|\balojamiento\b|\bchambres?\b|\bh[eé]bergement\b|\bcamere\b|\balloggio\b|\bquartos?\b|\balojamento\b|\bcamere\b|\bcazare\b|\bpokoje\b|\bubytov[aá]n[ií]\b|\bodalar?\b|\bkonaklama\b|\bстаи?\b|\bнастаняване\b|\bномера?\b)/iu,
  gastronomy: /(?:\bgastronomy\b|\bdining\b|\brestaurants?\b|\bbars?\b|\bcaf[eé]s?\b|\bbistros?\b|\bgastronom[ií]a\b|\brestaurantes?\b|\bbares?\b|\bcafeter[ií]as?\b|\brestauration\b|\bristoranti?\b|\brestoranlar?\b|\byeme\s+i[cç]me\b|\bресторанти?\b|\bбарове?\b|\bгастрономия\b)/iu,
  spa: /(?:\bspa\b|\bwellness\b|\bwellbeing\b|\btreatments?\b|\bmassages?\b|\btherap(?:y|ies)\b|\bbienestar\b|\btratamientos?\b|\bmasajes?\b|\bsoins?\b|\bbien[- ]?[eê]tre\b|\bbenessere\b|\btrattamenti?\b|\bbem[- ]estar\b|\btratamentos?\b|\bmasajlar?\b|\bterapi\b|\bспа\b|\bуелнес\b|\bпроцедури?\b|\bмасажи?\b)/iu,
  services: /(?:\bservices?\b|\bfacilities\b|\bamenities\b|\bguest\s+services?\b|\bservicios?\b|\binstalaciones\b|\bservizi\b|\bservi[cç]os?\b|\bleistungen\b|\binklusivleistungen\b|\bservicii\b|\bhizmetler?\b|\bуслуги\b|\bудобства\b)/iu,
  experiences: /(?:\bexperiences?\b|\bactivities\b|\bthings\s+to\s+do\b|\bexperiencias?\b|\bactividades\b|\berlebnisse\b|\baktivit[aä]ten\b|\bexp[eé]riences?\b|\bactivit[eé]s\b|\besperienze\b|\battivit[aà]\b|\bexperi[eê]ncias?\b|\batividades\b|\baktiviteler?\b|\bпреживявания\b|\bактивности\b)/iu,
  offers: /(?:\boffers?\b|\bpackages?\b|\bspecials?\b|\bpromotions?\b|\bofertas?\b|\bpaquetes?\b|\bpromociones?\b|\bangebote\b|\bpakete\b|\boffres?\b|\bforfaits?\b|\bofferte\b|\bpacchetti\b|\bofertas?\b|\bpacotes?\b|\bteklifler?\b|\bpaketler?\b|\bоферти\b|\bпакети\b)/iu,
  events: /(?:\bevents?\b|\bmeetings?\b|\bweddings?\b|\beventos?\b|\breuniones\b|\bbodas\b|\bveranstaltungen\b|\btagungen\b|\bhochzeiten\b|\b[eé]v[eé]nements?\b|\br[eé]unions?\b|\bmariages?\b|\beventi\b|\bmeeting\b|\bmatrimoni\b|\bсъбития\b)/iu,
});

function clean(value, max = 2_048) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, max);
}

function pageMap(evidence) {
  const result = new Map();
  for (const page of evidence?.pages || []) {
    const url = canonicalizeHotelIntakeUrl(page?.url || "");
    if (url) result.set(url, page);
  }
  return result;
}

function operationalDomainFromPage(page) {
  const classification = classifyHotelScannerPageV2(page || {});
  const domain = hotelScannerPageTypeDomain(classification.primaryType);
  if (!DOMAIN_SET.has(domain)) return null;
  return {
    domain,
    confidence: Number(classification.confidence || 0),
    type: classification.primaryType,
    signals: Array.isArray(classification.signals) ? classification.signals : [],
  };
}

function addVote(votes, signals, domain, weight, source, detail, structuralVotes = null) {
  if (!DOMAIN_SET.has(domain) || !(weight > 0)) return;
  votes.set(domain, (votes.get(domain) || 0) + weight);
  if (structuralVotes) structuralVotes.set(domain, (structuralVotes.get(domain) || 0) + weight);
  signals.push({
    source,
    domain,
    weight: Number(weight.toFixed(3)),
    detail: clean(detail, 500),
  });
}

function lexicalVotes(text, votes, signals, weight, source, structuralVotes = null) {
  const value = clean(text, 8_000);
  if (!value) return;
  for (const [domain, pattern] of Object.entries(DOMAIN_LEXICON)) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) addVote(votes, signals, domain, weight, source, value, structuralVotes);
  }
}

function familyContextText(family) {
  const urls = [family?.sourceUrl, ...(family?.members || []).slice(0, 12).map((item) => item?.url)]
    .map((value) => {
      try { return decodeURIComponent(new URL(String(value || "")).pathname); }
      catch { return clean(value, 500); }
    });
  return [
    family?.heading,
    family?.sourceTitle,
    ...(family?.sectionPath || []),
    ...urls,
  ].filter(Boolean).join(" ");
}

function memberUrlConsensus(family) {
  const counts = new Map();
  let classified = 0;
  for (const member of family?.members || []) {
    const url = canonicalizeHotelIntakeUrl(member?.url || "");
    if (!url) continue;
    const result = operationalDomainFromPage({
      url,
      title: clean(member?.label, 240),
      description: "",
      headings: [],
    });
    if (!result) continue;
    classified += 1;
    counts.set(result.domain, (counts.get(result.domain) || 0) + 1);
  }
  const ranked = [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((left, right) => right.count - left.count || left.domain.localeCompare(right.domain));
  const winner = ranked[0] || null;
  const ratio = winner && classified ? winner.count / classified : 0;
  return {
    winner,
    classified,
    ratio,
    accepted: Boolean(winner && classified >= 2 && ratio >= 0.67),
  };
}

export function classifyHotelStructuralFamilyV3(family = {}, evidence = {}) {
  const pages = pageMap(evidence);
  const votes = new Map();
  const structuralVotes = new Map();
  const signals = [];
  const sourceUrl = canonicalizeHotelIntakeUrl(family?.sourceUrl || "");
  const sourcePage = pages.get(sourceUrl);

  if (sourcePage) {
    const result = operationalDomainFromPage(sourcePage);
    if (result) {
      addVote(votes, signals, result.domain, 5 * Math.max(0.5, result.confidence), "source_page", result.type, structuralVotes);
    }
  }

  const syntheticFamily = {
    url: sourceUrl,
    title: clean(family?.heading || family?.sourceTitle, 240),
    description: clean((family?.sectionPath || []).join(" "), 500),
    headings: (family?.sectionPath || []).map((text) => ({ text })),
  };
  const syntheticResult = operationalDomainFromPage(syntheticFamily);
  if (syntheticResult) {
    addVote(votes, signals, syntheticResult.domain, 3 * Math.max(0.5, syntheticResult.confidence), "family_surface", syntheticResult.type, structuralVotes);
  }

  lexicalVotes(familyContextText(family), votes, signals, 3.5, "family_lexicon", structuralVotes);

  const memberConsensus = memberUrlConsensus(family);
  if (memberConsensus.accepted && memberConsensus.winner) {
    addVote(
      votes,
      signals,
      memberConsensus.winner.domain,
      7 + Math.min(3, memberConsensus.winner.count * 0.25),
      "member_url_consensus",
      `${memberConsensus.winner.count}/${memberConsensus.classified}`,
      structuralVotes,
    );
  }

  const structuralRanked = [...structuralVotes.entries()]
    .map(([domain, score]) => ({ domain, score }))
    .sort((left, right) => right.score - left.score || left.domain.localeCompare(right.domain));
  const structuralWinner = structuralRanked[0] || null;
  const structuralRunnerUp = structuralRanked[1] || null;
  const structuralAuthorityLocked = Boolean(
    structuralWinner
    && structuralWinner.score >= 3.5
    && structuralWinner.score - Number(structuralRunnerUp?.score || 0) >= 1.5
  );

  const crawledMembers = (family?.members || [])
    .map((member) => ({ member, page: pages.get(canonicalizeHotelIntakeUrl(member?.url || "")) }))
    .filter((entry) => entry.page)
    .slice(0, 6);
  for (const { member, page } of crawledMembers) {
    const result = operationalDomainFromPage(page);
    if (result) {
      const agreesWithAuthority = !structuralAuthorityLocked || result.domain === structuralWinner?.domain;
      const weight = agreesWithAuthority
        ? 1.5 * Math.max(0.5, result.confidence)
        : 0.15 * Math.max(0.5, result.confidence);
      addVote(votes, signals, result.domain, weight, "member_page", member?.url);
    }
  }

  const labelText = (family?.members || []).slice(0, 16).map((member) => clean(member?.label, 240)).filter(Boolean).join(" ");
  if (!structuralAuthorityLocked) {
    lexicalVotes(labelText, votes, signals, 1, "member_labels");
  }

  const ranked = [...votes.entries()]
    .map(([domain, score]) => ({ domain, score }))
    .sort((left, right) => right.score - left.score || left.domain.localeCompare(right.domain));

  if (structuralAuthorityLocked && structuralWinner) {
    ranked.sort((left, right) => {
      if (left.domain === structuralWinner.domain && right.domain !== structuralWinner.domain) return -1;
      if (right.domain === structuralWinner.domain && left.domain !== structuralWinner.domain) return 1;
      return right.score - left.score || left.domain.localeCompare(right.domain);
    });
  }
  const total = ranked.reduce((sum, item) => sum + item.score, 0);
  const winner = ranked[0] || null;
  const runnerUp = ranked[1] || null;
  const confidence = winner && total > 0 ? winner.score / total : 0;
  const margin = winner && total > 0 ? (winner.score - Number(runnerUp?.score || 0)) / total : 0;

  const accepted = Boolean(
    winner
    && winner.score >= 3
    && confidence >= 0.55
    && margin >= 0.15
  );

  return {
    familyId: clean(family?.id, 1_000),
    sourceUrl,
    domain: accepted ? winner.domain : "UNKNOWN",
    confidence: Number(confidence.toFixed(3)),
    margin: Number(margin.toFixed(3)),
    winnerScore: Number((winner?.score || 0).toFixed(3)),
    runnerUpScore: Number((runnerUp?.score || 0).toFixed(3)),
    status: accepted ? "CLASSIFIED" : "UNKNOWN",
    authoritySource: structuralAuthorityLocked ? "COLLECTION_STRUCTURE" : "WEIGHTED_EVIDENCE",
    structuralAuthorityLocked,
    memberUrlConsensus: {
      domain: memberConsensus.winner?.domain || "",
      classified: memberConsensus.classified,
      agreeing: memberConsensus.winner?.count || 0,
      ratio: Number(memberConsensus.ratio.toFixed(3)),
      accepted: memberConsensus.accepted,
    },
    rankedDomains: ranked.map((item) => ({
      domain: item.domain,
      score: Number(item.score.toFixed(3)),
    })),
    signals,
  };
}

export function classifyHotelStructuralFamiliesV3(structuralInventory = {}, evidence = {}) {
  const results = (structuralInventory?.families || []).map((family) =>
    classifyHotelStructuralFamilyV3(family, evidence));
  return {
    schemaVersion: "hotel-scanner-v3-ontology-1",
    families: results,
    counts: {
      totalFamilies: results.length,
      classifiedFamilies: results.filter((item) => item.status === "CLASSIFIED").length,
      unknownFamilies: results.filter((item) => item.status === "UNKNOWN").length,
    },
  };
}
