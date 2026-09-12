import { hotelScannerSourceDocumentKey, verifyHotelScanFacts } from "./hotel-scanner-verification.mjs";

const CROSS_DOMAIN_ATTRIBUTES = new Set([
  "address", "check_in", "check_out", "quiet_hours", "pet_policy", "smoking_policy", "external_access",
]);

function clean(value, max = 600) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}
function normalized(value) {
  return clean(value).toLocaleLowerCase("en-US").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-").replace(/[^\p{L}\p{N}+@.:-]+/gu, " ").replace(/\s+/g, " ").trim();
}
function attributeOf(fact) { return normalized(fact?.attribute).replace(/\s+/g, "_"); }
function subjectOf(fact) {
  const raw = normalized(fact?.subject || "hotel");
  if (!raw || /^(?:hotel|resort|property|grand resort|grand resort pavel banya|the hotel)$/.test(raw)) return "hotel";
  const simplified = raw
    .replace(/\b(?:restaurant|restoran|dining|club|culinary|facility|venue|ресторант|кулинарен|клуб)\b/giu, " ")
    .replace(/\s+/g, " ").trim();
  return simplified || raw;
}
function clockTokens(value) {
  const result = []; const seen = new Set(); const regex = /(?:^|\D)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/g;
  let match;
  while ((match = regex.exec(clean(value, 900)))) {
    const token = `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
    if (!seen.has(token)) { seen.add(token); result.push(token); }
  }
  return result;
}
function polarity(value, attribute) {
  const candidate = normalized(value);
  if (attribute === "pet_policy") {
    if (/(?:no pets?|not allowed|not permitted|forbidden|prohibit|не се допуск|не се разреш|забран)/iu.test(candidate)) return "prohibited";
    if (/(?:pets?.*(?:allowed|permitted|accepted|welcome)|допуск|разреш|позвол)/iu.test(candidate)) return "allowed";
  }
  if (attribute === "smoking_policy") {
    if (/(?:no smoking|non smoking|not allowed|prohibited|forbidden|забран|не се пуши)/iu.test(candidate)) return "prohibited";
    if (/(?:smoking.*(?:allowed|permitted)|разрешено.*пушен|зона за пуш)/iu.test(candidate)) return "allowed";
  }
  if (attribute === "external_access") {
    if (/(?:external|outside|non hotel|day guest|външн).*(?:allowed|welcome|permitted|access|visit|допуск|посещ|достъп)|(?:allowed|welcome|permitted).*(?:external|outside|външн)/iu.test(candidate)) return "external_allowed";
    if (/(?:exclusively|only).*(?:hotel|resort|guest|member)|само за.*(?:гост|член)|външн.*(?:не се допуск|нямат достъп)/iu.test(candidate)) return "guests_only";
  }
  return "";
}
function canonicalValue(fact) {
  const attribute = attributeOf(fact); const value = clean(fact?.value, 900);
  if (["pet_policy", "smoking_policy", "external_access"].includes(attribute)) return polarity(value, attribute) || normalized(value);
  if (["quiet_hours", "check_in", "check_out"].includes(attribute)) {
    const tokens = clockTokens(value); if (tokens.length) return tokens.join("|");
  }
  return normalized(value);
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }

function conflictSourceDocumentKey(rawUrl) {
  const value = clean(rawUrl, 2_048);
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|gclid$|fbclid$|msclkid$|mc_cid$|mc_eid$|_ga$|_gl$)/iu.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return value;
  }
}

function semanticExternalAccessSubject(fact) {
  const explicit = subjectOf(fact);
  if (explicit !== "hotel") return explicit;
  const text = normalized(`${fact?.label || ""} ${fact?.value || ""}`);
  if (/\bnero\b|\bнеро\b/iu.test(text)) return "nero";
  if (/(?:\bspa\b|wellness|pool|treatment|procedure|спа|уелнес|басейн|процедур)/iu.test(text)) return "spa";
  return "hotel";
}

function normalizeClaimSemantics(fact) {
  const attribute = attributeOf(fact);
  const text = normalized(`${fact?.label || ""} ${fact?.value || ""}`);
  let nextAttribute = attribute;
  let nextSubject = fact?.subject;

  if (attribute === "check_in" && /(?:early check.?in|ранно настаняване|fruh(?:er|es)? check)/iu.test(text)) nextAttribute = "early_check_in";
  if (attribute === "check_out" && /(?:late check.?out|късно освобождаване|late checkout|spat(?:er|es)? check)/iu.test(text)) nextAttribute = "late_check_out";

  if (attribute === "pet_policy") {
    if (/(?:\b\d+(?:[.,]\d+)?\s*kg\b|kilogram|килограм)/iu.test(text)) nextAttribute = "pet_max_weight";
    else if (/(?:unattended|supervision|leash|повод|надзор|без надзор|оставян)/iu.test(text)) nextAttribute = "pet_supervision";
    else if (/(?:well behaved|calm|trained|danger|спокоен нрав|възпитан|обучен|опасност)/iu.test(text)) nextAttribute = "pet_behavior_requirement";
  }

  if (attribute === "external_access") nextSubject = semanticExternalAccessSubject(fact);
  return { ...fact, attribute: nextAttribute || fact?.attribute, subject: nextSubject || fact?.subject };
}

function conflictSubject(value) {
  return attributeOf(value) === "external_access" ? semanticExternalAccessSubject(value) : subjectOf(value);
}
function conflictIdentity(value) { return `${conflictSubject(value)}|${attributeOf(value)}`; }
function independentConflict(conflict) {
  const urls = unique([
    ...(Array.isArray(conflict?.sourceUrls) ? conflict.sourceUrls : []),
    ...(Array.isArray(conflict?.claims) ? conflict.claims.flatMap((claim) => Array.isArray(claim?.sourceUrls) ? claim.sourceUrls : []) : []),
  ].map((url) => clean(url, 2_048)));
  return new Set(urls.map(conflictSourceDocumentKey)).size >= 2;
}

function buildCrossDomainConflicts(facts) {
  const groups = new Map();
  for (const fact of facts || []) {
    const attribute = attributeOf(fact);
    if (!CROSS_DOMAIN_ATTRIBUTES.has(attribute)) continue;
    const sourceUrls = unique(Array.isArray(fact?.sourceUrls) ? fact.sourceUrls.map((url) => clean(url, 2_048)) : []);
    if (!sourceUrls.length) continue;
    const value = canonicalValue(fact);
    if (!value) continue;
    const subject = conflictSubject(fact);
    const key = `${subject}|${attribute}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ fact, subject, attribute, value, sourceUrls });
  }

  const conflicts = [];
  for (const [key, entries] of groups) {
    const byValue = new Map();
    for (const entry of entries) {
      if (!byValue.has(entry.value)) byValue.set(entry.value, []);
      byValue.get(entry.value).push(entry);
    }
    if (byValue.size < 2) continue;
    const allSourceDocuments = new Set(entries.flatMap((entry) => entry.sourceUrls.map(conflictSourceDocumentKey)));
    if (allSourceDocuments.size < 2) continue;

    const claims = [...byValue.entries()].map(([canonical, claimEntries]) => {
      const representative = claimEntries[0].fact;
      const sourceUrls = unique(claimEntries.flatMap((entry) => entry.sourceUrls));
      return {
        category: clean(representative.category, 80),
        label: clean(representative.label, 160),
        value: clean(representative.value, 600),
        canonicalValue: canonical,
        confidence: Math.max(...claimEntries.map((entry) => Number(entry.fact?.confidence || 0))),
        sourceUrls,
        polarity: ["pet_policy", "smoking_policy", "external_access"].includes(claimEntries[0].attribute) ? canonical : null,
      };
    });
    conflicts.push({
      id: `scanner-v2-cross-domain-conflict:${key}`,
      topic: `cross-domain|${key}`,
      topicLabel: entries[0].attribute,
      subject: entries[0].subject,
      attribute: entries[0].attribute,
      state: "CONFLICT",
      reviewRequired: true,
      claims,
      sourceUrls: unique(claims.flatMap((claim) => claim.sourceUrls)),
    });
  }
  return conflicts;
}

export function verifyHotelScanFactsV2(inputFacts = []) {
  const semanticallyNormalizedFacts = (Array.isArray(inputFacts) ? inputFacts : []).map(normalizeClaimSemantics);
  const base = verifyHotelScanFacts(semanticallyNormalizedFacts);
  const credibleBaseConflicts = (base.conflicts || []).filter(independentConflict);
  const crossDomain = buildCrossDomainConflicts(base.facts);
  const existingKeys = new Set(credibleBaseConflicts.map(conflictIdentity));
  const supplemental = crossDomain.filter((conflict) => !existingKeys.has(conflictIdentity(conflict)));
  const conflicts = [...credibleBaseConflicts, ...supplemental];
  const removedBaseConflictCount = Math.max(0, Number(base.conflicts?.length || 0) - credibleBaseConflicts.length);
  return {
    ...base,
    conflicts,
    summary: {
      ...base.summary,
      conflictFactCount: conflicts.reduce((sum, conflict) => sum + Number(conflict?.claims?.length || 0), 0),
      conflictGroupCount: conflicts.length,
      inputFactCount: Array.isArray(inputFacts) ? inputFacts.length : 0,
      outputFactCount: Array.isArray(base.facts) ? base.facts.length : 0,
      crossDomainConflictCount: supplemental.length,
      rejectedSingleDocumentConflictCount: removedBaseConflictCount,
    },
  };
}
