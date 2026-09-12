const MIN_VERIFICATION_CONFIDENCE = 0.8;

// Only facts where two values cannot safely coexist are conflict-sensitive.
// Descriptions, meal wording, age bands, prices, policy clauses and similar
// multi-clause content may legitimately have several compatible statements.
const CONFLICT_SENSITIVE_ATTRIBUTES = new Set([
  "address",
  "check_in",
  "check_out",
  "quiet_hours",
  "pet_policy",
  "smoking_policy",
  "external_access",
]);

function text(value, max = 500) {
  const normalized = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : normalized.slice(0, max);
}

function normalized(value) {
  return text(value)
    .toLocaleLowerCase("en-US")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\s.,;:!?()[\]{}"'`]+/g, " ")
    .trim();
}

function snake(value) {
  return normalized(value).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
}

function unique(values, max = 20) {
  return [...new Set((values || []).map((value) => text(value, 2_048)).filter(Boolean))].slice(0, max);
}

export function hotelScannerSourceDocumentKey(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""));
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length && /^(?:bg|en|de|ro|mk|ru|cs)$/i.test(parts[0])) parts.shift();
    const path = `/${parts.join("/")}`.replace(/\/+$/, "") || "/";
    return `${url.origin}${path}`;
  } catch {
    return text(rawUrl, 2_048);
  }
}

function clockTokens(value) {
  const source = text(value, 800);
  const tokens = [];
  const seen = new Set();
  const regex = /(?:^|\D)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/g;
  let match;
  while ((match = regex.exec(source))) {
    const token = `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
    if (!seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }
  return tokens;
}

function semanticAttribute(fact) {
  const explicit = snake(fact?.attribute);
  const category = snake(fact?.category);
  const label = normalized(fact?.label);
  const value = normalized(fact?.value);
  const haystack = `${label} ${value}`;

  if (explicit === "quiet_hours") {
    if (/(?:complaint|compensation|charged|charge|fee|penalty|оплакван|обезщет|начисля|такса|санкц)/iu.test(haystack) && clockTokens(haystack).length < 2) return "noise_policy";
    if (clockTokens(haystack).length >= 2 || /(?:quiet hours|ruhezeit|orele de lini|часове за тишина|тихи часове)/iu.test(haystack)) return "quiet_hours";
  }

  if (category === "policy" && ["access", "other"].includes(explicit)) {
    if (/(?:food|beverage|restaurant|lobby bar|храна|напит|ресторант|лоби бар)/iu.test(haystack) && /(?:bring|take out|carry|внася|изнася)/iu.test(haystack)) return "food_beverage_policy";
    if (/(?:cook|cooking|готвен|приготвян)/iu.test(haystack)) return "room_cooking_policy";
    if (/(?:open fire|flame|barbecue|firework|открит огън|пламък|скара|фойерверк)/iu.test(haystack)) return "fire_safety_policy";
    if (/(?:weapon|оръжи)/iu.test(haystack)) return "weapons_policy";
    if (/(?:luggage|baggage|багаж)/iu.test(haystack) && /(?:who|only guests|reservation|кой|само гости|резервац)/iu.test(haystack)) return "luggage_access_policy";
    if (/(?:luggage|baggage|багаж)/iu.test(haystack)) return "luggage_storage_policy";
    if (/(?:smoking area|terrace|main entrance|зони за пушене|терас|главния вход)/iu.test(haystack)) return "designated_smoking_area";
  }

  if (category === "policy" && ["price", "fee", "other"].includes(explicit)) {
    if (/(?:noise|quiet|шум|тишин)/iu.test(haystack) && /(?:fee|penalty|charge|такса|санкц|начисля)/iu.test(haystack)) return "noise_penalty";
    if (/(?:cook|cooking|готвен|приготвян)/iu.test(haystack) && /(?:fee|penalty|charge|такса|санкц)/iu.test(haystack)) return "room_cooking_penalty";
    if (/(?:pet|pets|домашн.*любим)/iu.test(haystack) && /(?:fee|price|charge|такса|цена)/iu.test(haystack)) return "pet_fee";
    if (/(?:smok|пушен)/iu.test(haystack) && /(?:fee|penalty|cleaning|charge|такса|почиств|санкц)/iu.test(haystack)) return "smoking_penalty";
  }

  if ((explicit === "duration" || !explicit) && /(?:minimum|minimal|recommended|stay|prestoi|престой|дни|days|nights|нощув)/iu.test(haystack)) return "recommended_stay";
  if ((explicit === "duration" || !explicit) && /(?:minute|minutes|hour|hours|минути|минута|часа|час\b)/iu.test(haystack)) return "session_duration";
  if ((explicit === "access" || explicit === "external_access" || !explicit) && /(?:dress\s*code|attire|clothing|elegant|smart casual|дрескод|облекло|елегантн)/iu.test(haystack)) return "dress_code";
  if ((explicit === "access" || !explicit) && /(?:adult(?:s)? only|18\+|16\+|age|children|kids|child|възрастни|деца|детски|години)/iu.test(haystack)) return "age_policy";
  if ((explicit === "access" || explicit === "external_access" || !explicit) && /(?:external|outside|non[ -]?hotel|day guest|resort guests?|members?|външн|само за гости|гости на курорта|членове)/iu.test(haystack)) return "external_access";

  if (explicit) return explicit;
  if (category === "location" && /(?:address|адрес)/u.test(label)) return "address";
  if (category === "contact" && (/(?:e mail|email|имейл)/u.test(label) || value.includes("@"))) return "email";
  if (category === "contact" && /(?:phone|telephone|tel|телефон)/u.test(label)) return "phone";
  if (category === "operations" && /(?:check[ -]?in|настаняване)/u.test(label)) return "check_in";
  if (category === "operations" && /(?:check[ -]?out|освобождаване|напускане)/u.test(label)) return "check_out";
  if (category === "accommodation" && /(?:room type|тип стая|вид стая|тип помещение)/u.test(label)) return "room_type";
  if (category === "policy" && /(?:pet|домашн.*любим)/u.test(haystack)) return "pet_policy";
  if (category === "policy" && /(?:quiet|тишин)/u.test(haystack) && clockTokens(haystack).length >= 2) return "quiet_hours";
  if (category === "policy" && /(?:noise|шум)/u.test(haystack)) return "noise_policy";
  if (category === "policy" && /(?:smok|пушен)/u.test(haystack)) return "smoking_policy";
  if (/^(?:dining|wellness|services|amenities)$/u.test(category) && /(?:hours|opening|working|работно време|часове)/u.test(label)) return "hours";
  if (category === "amenities") return "amenity";
  if (category === "wellness") return "service";
  if (category === "dining") return "venue";
  return snake(label) || "fact";
}

function inferSubject(fact) {
  const explicit = text(fact?.subject, 160);
  if (explicit) return explicit;
  const category = snake(fact?.category);
  if (["identity", "location", "contact", "operations", "policy", "hotel"].includes(category)) return "hotel";
  return text(fact?.label, 160) || "hotel";
}

function semanticSubject(fact) {
  const category = snake(fact?.category);
  const attribute = semanticAttribute(fact);
  const raw = inferSubject(fact);
  if (!raw) return "hotel";
  if (category !== "dining" || !["external_access", "hours", "booking", "dress_code", "age_policy", "venue"].includes(attribute)) return snake(raw) || "hotel";
  const simplified = normalized(raw)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(?:restaurant|restoran|dining|culinary|club|restaurantul|ресторант|кулинарен|клуб|a la carte|à la carte)\b/giu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return snake(simplified || raw) || "hotel";
}

function factEligible(fact) {
  const confidence = Number(fact?.confidence ?? 0);
  return Number.isFinite(confidence) && confidence >= MIN_VERIFICATION_CONFIDENCE && Array.isArray(fact?.sourceUrls) && fact.sourceUrls.some((url) => text(url));
}

function groupKey(fact) {
  return `${snake(fact?.category) || "hotel"}|${semanticSubject(fact)}|${semanticAttribute(fact)}`;
}

function mergeSourceUrls(facts) {
  return unique(facts.flatMap((fact) => Array.isArray(fact?.sourceUrls) ? fact.sourceUrls : []), 20);
}

function policyPolarity(value, kind) {
  const candidate = normalized(value);
  if (kind === "pet_policy") {
    if (/(?:no pets?|pets? (?:are )?not (?:allowed|permitted|accepted)|not allowed|not permitted|forbidden|prohibit|не се (?:допуск|разреш|прием)|домашни любимци не|забран)/iu.test(candidate)) return "prohibited";
    if (/(?:pets? (?:are )?(?:allowed|permitted|accepted|welcome)|allowed|permitted|accepted|допуск|разреш|позвол|приема(?:т)?.*домашни любимци)/iu.test(candidate)) return "allowed";
  }
  if (kind === "smoking_policy") {
    if (/(?:non[ -]?smoking|smoking (?:is )?(?:not allowed|prohibited|forbidden)|no smoking|непушач|пушенето.*забран|не се пуши)/iu.test(candidate)) return "prohibited";
    if (/(?:smoking (?:is )?(?:allowed|permitted)|разрешено.*пушен|зона за пуш)/iu.test(candidate)) return "allowed";
  }
  if (kind === "external_access") {
    if (/(?:external|outside|non[ -]?hotel|day guest|външн).*(?:allowed|welcome|permitted|access|visit|допуск|посещ|достъп)|(?:allowed|welcome|permitted).*(?:external|outside|non[ -]?hotel|външн)/iu.test(candidate)) return "external_allowed";
    if (/(?:exclusively|only).*(?:hotel|resort|guest|member)|само за.*(?:гост|член)|външн.*(?:не се допуск|нямат достъп)/iu.test(candidate)) return "guests_only";
  }
  return "unknown";
}

function phoneClaimKey(value) {
  let digits = text(value, 100).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

function canonicalClaimKey(fact) {
  const attribute = semanticAttribute(fact);
  const raw = text(fact?.value, 800);
  if (!raw) return "";
  if (attribute === "phone") return phoneClaimKey(raw);
  if (attribute === "email") return raw.toLocaleLowerCase("en-US").replace(/^mailto:/i, "").trim();
  if (["check_in", "check_out"].includes(attribute)) {
    const tokens = clockTokens(raw);
    if (tokens.length) return tokens[0];
  }
  if (["hours", "quiet_hours"].includes(attribute)) {
    const tokens = clockTokens(raw);
    if (tokens.length) return tokens.join("|");
  }
  if (["pet_policy", "smoking_policy", "external_access"].includes(attribute)) {
    const polarity = policyPolarity(raw, attribute);
    if (polarity !== "unknown") return polarity;
  }
  return normalized(raw);
}

function reviewPolarity(fact) {
  const attribute = semanticAttribute(fact);
  if (!["pet_policy", "smoking_policy", "external_access"].includes(attribute)) return null;
  const polarity = policyPolarity(fact?.value, attribute);
  return polarity === "unknown" ? null : polarity;
}

function representativeFact(bucket) {
  const ranked = [...bucket].sort((left, right) => {
    if (semanticAttribute(left.fact) === "phone") {
      const leftIntl = text(left.fact.value).startsWith("+") ? 1 : 0;
      const rightIntl = text(right.fact.value).startsWith("+") ? 1 : 0;
      if (leftIntl !== rightIntl) return rightIntl - leftIntl;
    }
    return Number(right.fact.confidence || 0) - Number(left.fact.confidence || 0);
  });
  return ranked[0]?.fact || bucket[0]?.fact || {};
}

function mergedVerifiedFact(bucket, status) {
  const representative = representativeFact(bucket);
  const urls = mergeSourceUrls(bucket.map((item) => item.fact));
  return {
    ...representative,
    subject: inferSubject(representative),
    attribute: semanticAttribute(representative),
    confidence: Math.max(...bucket.map((item) => Number(item.fact.confidence || 0))),
    sourceUrls: urls,
    verification: { status, independentSourceCount: new Set(urls.map(hotelScannerSourceDocumentKey)).size, sourceUrls: urls },
  };
}

export function verifyHotelScanFacts(inputFacts = []) {
  const prepared = (Array.isArray(inputFacts) ? inputFacts : []).map((fact) => ({ ...fact, subject: inferSubject(fact), attribute: semanticAttribute(fact) }));
  const eligibleGroups = new Map();
  const passthrough = [];
  for (const fact of prepared) {
    if (!factEligible(fact)) { passthrough.push(fact); continue; }
    const key = groupKey(fact);
    const group = eligibleGroups.get(key) || [];
    group.push({ fact });
    eligibleGroups.set(key, group);
  }

  const outputFacts = [...passthrough];
  const conflicts = [];
  let verifiedCount = 0;
  let singleSourceCount = 0;
  let conflictFactCount = 0;

  for (const [key, group] of eligibleGroups.entries()) {
    const firstFact = group[0]?.fact || {};
    const attribute = semanticAttribute(firstFact);
    const byValue = new Map();
    for (const item of group) {
      const valueKey = canonicalClaimKey(item.fact);
      if (!valueKey) continue;
      const bucket = byValue.get(valueKey) || [];
      bucket.push(item);
      byValue.set(valueKey, bucket);
    }

    const isConflict = CONFLICT_SENSITIVE_ATTRIBUTES.has(attribute) && byValue.size > 1;
    if (isConflict) {
      const claims = [...byValue.values()].map((bucket) => {
        const merged = mergedVerifiedFact(bucket, "CONFLICT");
        outputFacts.push(merged);
        conflictFactCount += 1;
        return {
          category: text(merged.category, 80), label: text(merged.label, 160), value: text(merged.value, 500),
          canonicalValue: canonicalClaimKey(merged), confidence: Number(merged.confidence || 0), sourceUrls: merged.sourceUrls,
          polarity: reviewPolarity(merged),
        };
      });
      conflicts.push({
        id: `scanner-verification-conflict:${key}`, topic: key, topicLabel: text(firstFact.label, 160) || attribute,
        subject: inferSubject(firstFact), attribute, state: "CONFLICT", reviewRequired: true, claims,
        sourceUrls: unique(claims.flatMap((claim) => claim.sourceUrls), 24),
      });
      continue;
    }

    for (const bucket of byValue.values()) {
      const urls = mergeSourceUrls(bucket.map((item) => item.fact));
      const independentSourceCount = new Set(urls.map(hotelScannerSourceDocumentKey)).size;
      const status = independentSourceCount >= 2 ? "VERIFIED" : "SINGLE_SOURCE";
      outputFacts.push(mergedVerifiedFact(bucket, status));
      if (status === "VERIFIED") verifiedCount += 1;
      else singleSourceCount += 1;
    }
  }

  return {
    facts: outputFacts,
    conflicts,
    summary: {
      schemaVersion: "hotel-scan-verification-v2",
      verifiedFactCount: verifiedCount,
      singleSourceFactCount: singleSourceCount,
      conflictFactCount,
      conflictGroupCount: conflicts.length,
    },
  };
}
