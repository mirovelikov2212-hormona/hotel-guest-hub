function text(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}

function scopeToken(value) {
  const input = text(value);
  if (/(holiday|special package|special offer|празнич|специалн.*пакет|специалн.*оферт)/iu.test(input)) return "special_package";
  let match = input.match(/(?:less than|under|по-кратък|по малко)\s*(?:от\s*)?(\d+)\s*(?:days?|дни)/iu);
  if (match) return `lt_${match[1]}_days`;
  match = input.match(/(?:up to|до)\s*(\d+)\s*(?:days?|дни)/iu);
  if (match) return `up_to_${match[1]}_days`;
  return "general";
}

export function refineHotelPolicySemantics(fact) {
  const category = text(fact?.category).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  const attribute = text(fact?.attribute).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  const haystack = `${text(fact?.label)} ${text(fact?.value)}`;
  let nextAttribute = attribute;

  if (category === "policy" && ["price", "fee", "other"].includes(attribute)) {
    if (/(pet|pets|домашн.*любим)/iu.test(haystack) && /(?:fee|charge|price|такса|цена)/iu.test(haystack)) {
      nextAttribute = "pet_fee";
    } else if (/(smok|пушен)/iu.test(haystack) && /(?:fee|penalty|cleaning|charge|такса|почиств|наруш)/iu.test(haystack)) {
      nextAttribute = "smoking_penalty";
    }
  } else if (attribute === "booking") {
    if (/(phone|email|website|platform|телефон|имейл|уебсайт|платформ)/iu.test(haystack)) nextAttribute = "booking_channel";
    else if (/(deposit|капаро)/iu.test(haystack) && /%/u.test(haystack)) nextAttribute = "deposit_amount";
    else if (/(confirm|потвържд|окончателна)/iu.test(haystack)) nextAttribute = "booking_confirmation";
    else nextAttribute = "booking_requirement";
  } else if (attribute === "payment_policy") {
    if (/(cash|card|credit|debit|в брой|карта)/iu.test(haystack)) nextAttribute = "payment_method";
    else if (/(balance|check.?in|prepaid|остатък|при настаняване|предварително)/iu.test(haystack)) nextAttribute = "payment_timing";
    else nextAttribute = "payment_terms";
  } else if (attribute === "cancellation_policy") {
    nextAttribute = /(?:refund|refundable|възстанов|капаро)/iu.test(haystack)
      ? `cancellation_refund_rule__${scopeToken(haystack)}`
      : `cancellation_terms__${scopeToken(haystack)}`;
  } else if (attribute === "smoking_policy") {
    if (/(fee|penalty|cleaning|такса|почиств)/iu.test(haystack)) nextAttribute = "smoking_penalty";
    else if (/(designated|smoking area|terrace|main entrance|места за пушене|терас|главния вход)/iu.test(haystack)) nextAttribute = "designated_smoking_area";
    else nextAttribute = "smoking_restriction";
  }

  return { ...fact, attribute: nextAttribute };
}
