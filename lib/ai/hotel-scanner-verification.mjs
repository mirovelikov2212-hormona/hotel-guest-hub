const MIN_VERIFICATION_CONFIDENCE = 0.8;

const MULTI_VALUE_ATTRIBUTES = new Set([
  "amenity",
  "email",
  "facility",
  "language",
  "offer",
  "phone",
  "room_type",
  "service",
  "social_profile",
  "treatment",
  "venue",
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

function inferAttribute(fact) {
  const explicit = snake(fact?.attribute);
  if (explicit) return explicit;

  const category = snake(fact?.category);
  const label = normalized(fact?.label);
  const value = normalized(fact?.value);
  const haystack = `${label} ${value}`;

  if (category === "location" && /(?:address|адрес)/u.test(label)) return "address";
  if (category === "contact" && (/(?:e mail|email|имейл)/u.test(label) || value.includes("@"))) return "email";
  if (category === "contact" && /(?:phone|telephone|tel|телефон)/u.test(label)) return "phone";
  if (category === "operations" && /(?:check[ -]?in|настаняване)/u.test(label)) return "check_in";
  if (category === "operations" && /(?:check[ -]?out|освобождаване|напускане)/u.test(label)) return "check_out";
  if (category === "accommodation" && /(?:room type|тип стая|вид стая|тип помещение)/u.test(label)) return "room_type";
  if (category === "policy" && /(?:pet|домашн.*любим)/u.test(haystack)) return "pet_policy";
  if (category === "policy" && /(?:quiet|noise|тишин|шум)/u.test(haystack)) return "quiet_hours";
  if (category === "policy" && /(?:smok|пушен)/u.test(haystack)) return "smoking_policy";
  if (/^(?:dining|wellness|services|amenities)$/u.test(category) && /(?:hours|opening|working|работно време|часове)/u.test(label)) return "hours";
  if (/^(?:dining|wellness|services|amenities)$/u.test(category) && /(?:external|outside|non hotel|външн)/u.test(haystack)) return "external_access";
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

function factEligible(fact) {
  const confidence = Number(fact?.confidence ?? 0);
  return Number.isFinite(confidence)
    && confidence >= MIN_VERIFICATION_CONFIDENCE
    && Array.isArray(fact?.sourceUrls)
    && fact.sourceUrls.some((url) => text(url));
}

function groupKey(fact) {
  return `${snake(fact?.category) || "hotel"}|${snake(inferSubject(fact)) || "hotel"}|${inferAttribute(fact)}`;
}

function mergeSourceUrls(facts) {
  return unique(facts.flatMap((fact) => Array.isArray(fact?.sourceUrls) ? fact.sourceUrls : []), 20);
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

function policyPolarity(value, kind) {
  const candidate = normalized(value);
  if (kind === "pet_policy") {
    if (/(?:no pets?|pets? (?:are )?not (?:allowed|permitted|accepted)|not allowed|not permitted|forbidden|prohibit|не се (?:допуск|разреш|прием)|домашни любимци не|забран)/iu.test(candidate)) return "prohibited";
    if (/(?:pets? (?:are )?(?:allowed|permitted|accepted|welcome)|allowed|permitted|accepted|допуск|разреш|позвол|приемат домашни любимци)/iu.test(candidate)) return "allowed";
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
  const attribute = inferAttribute(fact);
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
  if (inferAttribute(fact) !== "pet_policy") return null;
  const polarity = policyPolarity(fact?.value, "pet_policy");
  return ["allowed", "prohibited", "unknown"].includes(polarity) ? polarity : "unknown";
}

export function verifyHotelScanFacts(inputFacts = []) {
  const facts = (Array.isArray(inputFacts) ? inputFacts : []).map((fact) => ({
    ...fact,
    subject: inferSubject(fact),
    attribute: inferAttribute(fact),
  }));

  const groups = new Map();
  for (const [index, fact] of facts.entries()) {
    if (!factEligible(fact)) continue;
    const key = groupKey(fact);
    const group = groups.get(key) || [];
    group.push({ index, fact });
    groups.set(key, group);
  }

  const conflicts = [];
  let verifiedCount = 0;
  let singleSourceCount = 0;
  let conflictFactCount = 0;

  for (const [key, group] of groups.entries()) {
    const firstFact = group[0]?.fact || {};
    const attribute = firstFact.attribute || "fact";
    const byValue = new Map();
    for (const item of group) {
      const valueKey = canonicalClaimKey(item.fact);
      if (!valueKey) continue;
      const bucket = byValue.get(valueKey) || [];
      bucket.push(item);
      byValue.set(valueKey, bucket);
    }

    const isConflict = !MULTI_VALUE_ATTRIBUTES.has(attribute) && byValue.size > 1;
    if (isConflict) {
      const claims = [...byValue.values()].map((bucket) => ({
        category: text(bucket[0]?.fact?.category, 80),
        label: text(bucket[0]?.fact?.label, 160),
        value: text(bucket[0]?.fact?.value, 500),
        canonicalValue: canonicalClaimKey(bucket[0]?.fact),
        confidence: Math.max(...bucket.map((item) => Number(item.fact.confidence || 0))),
        sourceUrls: mergeSourceUrls(bucket.map((item) => item.fact)),
        polarity: reviewPolarity(bucket[0]?.fact),
      }));
      conflicts.push({
        id: `scanner-verification-conflict:${key}`,
        topic: key,
        topicLabel: text(firstFact.label, 160) || attribute,
        subject: firstFact.subject || "hotel",
        attribute,
        state: "CONFLICT",
        reviewRequired: true,
        claims,
        sourceUrls: unique(claims.flatMap((claim) => claim.sourceUrls), 24),
      });
      for (const item of group) {
        facts[item.index] = {
          ...facts[item.index],
          verification: {
            status: "CONFLICT",
            independentSourceCount: new Set(item.fact.sourceUrls.map(hotelScannerSourceDocumentKey)).size,
            sourceUrls: unique(item.fact.sourceUrls),
          },
        };
        conflictFactCount += 1;
      }
      continue;
    }

    for (const bucket of byValue.values()) {
      const urls = mergeSourceUrls(bucket.map((item) => item.fact));
      const independentSourceCount = new Set(urls.map(hotelScannerSourceDocumentKey)).size;
      const status = independentSourceCount >= 2 ? "VERIFIED" : "SINGLE_SOURCE";
      for (const item of bucket) {
        facts[item.index] = {
          ...facts[item.index],
          verification: { status, independentSourceCount, sourceUrls: urls },
        };
        if (status === "VERIFIED") verifiedCount += 1;
        else singleSourceCount += 1;
      }
    }
  }

  return {
    facts,
    conflicts,
    summary: {
      schemaVersion: "hotel-scan-verification-v1",
      verifiedFactCount: verifiedCount,
      singleSourceFactCount: singleSourceCount,
      conflictFactCount,
      conflictGroupCount: conflicts.length,
    },
  };
}
