import { hotelScannerSourceDocumentKey, verifyHotelScanFacts } from "./hotel-scanner-verification.mjs";

const CROSS_DOMAIN_ATTRIBUTES = new Set([
  "address", "check_in", "check_out", "quiet_hours", "pet_policy", "smoking_policy", "external_access",
]);

const GENERIC_SUBJECT = /^(?:hotel|resort|property|grand resort|grand resort pavel banya|the hotel|hotel policy|policy|terms|terms and conditions|general terms|faq|frequently asked questions|политика на хотела|хотелска политика|общи условия|условия|често задавани въпроси|политика|hotelrichtlinien|allgemeine bedingungen|häufig gestellte fragen|politica hotelului|termeni și condiții|întrebări frecvente|hotelová pravidla|obchodní podmínky|často kladené otázky|правила отеля|условия|часто задаваемые вопросы)$/iu;

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
  if (!raw || GENERIC_SUBJECT.test(raw)) return "hotel";
  const simplified = raw
    .replace(/\b(?:restaurant|restoran|dining|club|culinary|facility|venue|ресторант|кулинарен|клуб)\b/giu, " ")
    .replace(/\s+/g, " ").trim();
  return simplified || raw;
}
function clockTokens(value) {
  const result = []; const seen = new Set(); const regex = /(?:^|\D)([01]?\d|2[0-3])[:.]([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)?(?!\d)/giu;
  let match;
  while ((match = regex.exec(clean(value, 900)))) {
    let hour = Number(match[1]);
    const meridiem = String(match[3] || "").replace(/\./g, "").toLocaleLowerCase("en-US");
    if (meridiem) {
      if (hour < 1 || hour > 12) continue;
      if (meridiem === "am") hour = hour === 12 ? 0 : hour;
      if (meridiem === "pm") hour = hour === 12 ? 12 : hour + 12;
    }
    const token = `${String(hour).padStart(2, "0")}:${match[2]}`;
    if (!seen.has(token)) { seen.add(token); result.push(token); }
  }
  return result;
}
function polarity(value, attribute) {
  const candidate = normalized(value);
  if (attribute === "pet_policy") {
    if (/(?:no pets?|not allowed|not permitted|forbidden|prohibit|не (?:се|са) (?:допуск\p{L}*|разреш\p{L}*|прием\p{L}*)|забран)/iu.test(candidate)) return "prohibited";
    if (/(?:pets?.*(?:allowed|permitted|accepted|welcome)|допуск|разреш|позвол)/iu.test(candidate)) return "allowed";
  }
  if (attribute === "smoking_policy") {
    if (/(?:no smoking|non smoking|not allowed|prohibited|forbidden|забран|не се пуши)/iu.test(candidate)) return "prohibited";
    if (/(?:smoking.*(?:allowed|permitted)|разрешено.*пушен|зона за пуш)/iu.test(candidate)) return "allowed";
  }
  if (attribute === "external_access") {
    const externalParty = "(?:external|outside|non hotel|day guest|външн)";
    const positiveAccess = "(?:allowed|welcome|permitted|access|visit|open|available|accept(?:s|ed)?|admit(?:s|ted)?)";
    if (new RegExp(`${externalParty}.*${positiveAccess}|${positiveAccess}.*${externalParty}`, "iu").test(candidate)) return "external_allowed";
    if (/(?:external|outside|non hotel|day guest|външн).*(?:may|can).*(?:dine|visit|access|book|reserve|посещ|достъп)|(?:may|can).*(?:external|outside|non hotel|day guest|външн).*(?:dine|visit|access|book|reserve|посещ|достъп)/iu.test(candidate)) return "external_allowed";
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

const COUNTRY_ALIASES = Object.freeze([
  [/(?:^|\s)(?:bulgaria|българия|bulgarien|bulgarie|bulgaristan)(?=\s|$)/giu, " bulgaria"],
  [/(?:^|\s)(?:turkey|turkiye|türkiye|turkei|turcia|турция|турция|турkiye)(?=\s|$)/giu, " turkey"],
  [/(?:^|\s)(?:romania|românia|rumanien|rumänien|румъния|romanya)(?=\s|$)/giu, " romania"],
  [/(?:^|\s)(?:greece|гръция|griechenland|grecia|yunanistan)(?=\s|$)/giu, " greece"],
  [/(?:^|\s)(?:germany|deutschland|германия|allemagne|germania|almanya)(?=\s|$)/giu, " germany"],
  [/(?:^|\s)(?:serbia|сърбия|serbien|sırbistan|sirbistan)(?=\s|$)/giu, " serbia"],
  [/(?:^|\s)(?:north macedonia|северна македония|nordmazedonien|kuzey makedonya)(?=\s|$)/giu, " north_macedonia"],
  [/(?:^|\s)(?:croatia|хърватия|kroatien|hırvatistan|hirvatistan)(?=\s|$)/giu, " croatia"],
  [/(?:^|\s)(?:hungary|унгария|ungarn|macaristan)(?=\s|$)/giu, " hungary"],
  [/(?:^|\s)(?:czechia|czech republic|чехия|tschechien|çekya|cekya)(?=\s|$)/giu, " czechia"],
]);

function normalizeAddressValue(value) {
  let result = normalized(value);
  for (const [pattern, replacement] of COUNTRY_ALIASES) result = result.replace(pattern, replacement);
  return result.replace(/\s+/gu, " ").trim();
}

function addressTokens(value) {
  return new Set(normalizeAddressValue(value).split(/\s+/u).filter(Boolean));
}

function tokenSetContains(container, subset) {
  if (!container.size || !subset.size) return false;
  for (const token of subset) if (!container.has(token)) return false;
  return true;
}

function addressValuesAreSpecificityCompatible(values) {
  const sets = unique(values.map((value) => normalizeAddressValue(value))).map(addressTokens).filter((tokens) => tokens.size);
  if (sets.length < 2) return true;
  for (let left = 0; left < sets.length; left += 1) {
    for (let right = left + 1; right < sets.length; right += 1) {
      if (!tokenSetContains(sets[left], sets[right]) && !tokenSetContains(sets[right], sets[left])) return false;
    }
  }
  return true;
}

function specificityOnlyAddressConflict(conflict) {
  if (attributeOf(conflict) !== "address" && normalized(conflict?.attribute) !== "address") return false;
  const claims = Array.isArray(conflict?.claims) ? conflict.claims : [];
  const values = claims.map((claim) => clean(claim?.canonicalValue || claim?.value, 900)).filter(Boolean);
  return values.length > 1 && addressValuesAreSpecificityCompatible(values);
}

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

  if (attribute === "address") {
    const label = normalized(fact?.label || "");
    const descriptiveLocation = /(?:northern|southern|eastern|western|central|north(?:ern)? part|south(?:ern)? part|east(?:ern)? part|west(?:ern)? part|part of (?:the )?(?:resort|area)|first line|beachfront|северн|южн|източн|западн|централн|част на курорта|част от курорта|района|първа линия|на самия плаж|kuzey|guney|dogu|bati|bolgesinde|bolgesinin|sahil kesimi)/iu.test(text);
    const postalLabel = /(?:postal(?: code)?|post ?code|zip(?: code)?|пощенски код|posta kodu|postleitzahl|cod po[sș]tal|ps[cč]|почтовый индекс)/iu.test(label);
    const localityLabel = /^(?:city|town|locality|region|province|state|district|град|област|регион|населено място|[sş]ehir|il[cç]e|il|stadt|ort|region|provinz|ora[sș]|jude[tț]|regiune|m[eě]sto|kraj|region|город|область|регион)$/iu.test(label);
    const postalOrStreetAddress = /(?:\b\d{4,6}\b|\bstreet\b|\broad\b|\bboulevard\b|\bavenue\b|\bstr\.?\b|\bul\.?\b|\bbul\.?\b|улица|булевард|cadde|sokak|mahallesi)/iu.test(text);
    if (postalLabel) nextAttribute = "postal_code";
    else if (localityLabel) nextAttribute = "city_region";
    else if (descriptiveLocation && !postalOrStreetAddress) nextAttribute = "location_description";
  }

  if (attribute === "check_in") {
    if (/(?:early check.?in|ранно настаняване|fruh(?:er|es)? check)/iu.test(text)) nextAttribute = "early_check_in";
    else if (/(?:identity|identification|id card|passport|personal document|лична карта|документ за самоличност|личен документ|ausweis|reisepass)/iu.test(text)) nextAttribute = "check_in_identity_requirement";
    else if (!clockTokens(text).length && /(?:registration|form|signature|регистрац|формуляр|подпис)/iu.test(text)) nextAttribute = "check_in_procedure";
  }

  if (attribute === "check_out") {
    if (/(?:late check.?out|късно освобождаване|late checkout|spat(?:er|es)? check)/iu.test(text)) nextAttribute = "late_check_out";
    else if (!clockTokens(text).length && /(?:key|return|settle|payment|ключ|плащане|сметка)/iu.test(text)) nextAttribute = "check_out_procedure";
  }

  if (attribute === "quiet_hours" && !clockTokens(text).length) {
    nextAttribute = "noise_conduct_rule";
  }

  if (attribute === "pet_policy") {
    if (/(?:contact|reception|front desk|questions?|inquir|свържете|рецепц|въпроси|запитван)/iu.test(text) && !polarity(text, "pet_policy")) nextAttribute = "pet_contact_guidance";
    else if (/(?:\b\d+(?:[.,]\d+)?\s*kg\b|kilogram|килограм)/iu.test(text)) nextAttribute = "pet_max_weight";
    else if (/(?:unattended|supervision|leash|повод|надзор|без надзор|оставян)/iu.test(text)) nextAttribute = "pet_supervision";
    else if (/(?:well behaved|calm|trained|danger|спокоен нрав|възпитан|обучен|опасност)/iu.test(text)) nextAttribute = "pet_behavior_requirement";
    else if (/(?:fee|charge|per night|nightly|такса|на нощ|на нощувка|eur|euro|€)/iu.test(text) && /(?:\d|eur|euro|€)/iu.test(text)) nextAttribute = "pet_fee";
  }

  if (attribute === "smoking_policy") {
    if (/(?:cleaning fee|penalty|fine|charge|такса|глоба|санкц|eur|euro|€)/iu.test(text) && /(?:\d|eur|euro|€)/iu.test(text)) nextAttribute = "smoking_violation_fee";
    else if (/(?:terrace|designated|smoking area|main entrance|терас|зона за пуш|главния вход)/iu.test(text)) nextAttribute = "smoking_designated_area";
  }

  if (attribute === "external_access" || attribute === "access") {
    if (/(?:management|management right|refuse service|remove guest|vacate|evict|ръководств|откаже услуг|освободи стаята|отстрани лице)/iu.test(text)) {
      nextAttribute = "management_refusal_or_removal_right";
    } else if (/(?:camera|cctv|video surveillance|videouberwachung|видеонаблюдение|камер)/iu.test(text)) {
      nextAttribute = "video_surveillance";
    } else if (/(?:electric vehicle|ev charging|charging station|22 kw|електромобил|зарядн)/iu.test(text)) {
      nextAttribute = "ev_charging";
    } else if (/(?:barefoot|slippers|bathrobe|dress code|бос|джапанк|халат|бански)/iu.test(text)) {
      nextAttribute = "dining_dress_code";
    } else if (polarity(text, "external_access")) {
      nextAttribute = "external_access";
      nextSubject = semanticExternalAccessSubject(fact);
    } else if (attribute === "external_access") {
      nextAttribute = "access_guidance";
    }
  }

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
    if (entries[0].attribute === "address" && addressValuesAreSpecificityCompatible([...byValue.keys()])) continue;
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
  const credibleBaseConflicts = (base.conflicts || [])
    .filter(independentConflict)
    .filter((conflict) => !specificityOnlyAddressConflict(conflict));
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
