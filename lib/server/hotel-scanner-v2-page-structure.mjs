const ENTITY_JSON_LD_TYPES = new Set([
  "hotelroom", "room", "suite", "accommodation",
  "restaurant", "foodestablishment", "barorpub", "cafeorcoffeeshop",
  "healthandbeautybusiness", "dayspa", "medicalbusiness", "service", "event", "offer",
]);

function clean(value, max = 500) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function uniqueBy(values, keyOf) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = keyOf(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function jsonLdTypes(value) {
  const raw = value?.["@type"];
  return (Array.isArray(raw) ? raw : [raw])
    .map((item) => clean(item, 80).toLocaleLowerCase("en-US"))
    .filter(Boolean);
}

function collectJsonLdEntities(value, result, depth = 0) {
  if (depth > 10 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 250)) collectJsonLdEntities(item, result, depth + 1);
    return;
  }
  if (typeof value !== "object") return;

  const record = value;
  const types = jsonLdTypes(record);
  const name = clean(record.name, 240);
  if (name && types.some((type) => ENTITY_JSON_LD_TYPES.has(type))) {
    result.push({ name, types });
  }

  const itemList = record.itemListElement;
  if (Array.isArray(itemList)) {
    for (const item of itemList.slice(0, 250)) {
      const target = item && typeof item === "object" && item.item && typeof item.item === "object" ? item.item : item;
      const itemName = clean(target?.name || item?.name, 240);
      if (itemName) result.push({ name: itemName, types: ["itemlist"] });
    }
  }

  for (const child of Object.values(record)) collectJsonLdEntities(child, result, depth + 1);
}

function mainContentHtml(source) {
  const main = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const body = source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  return String(main || body || source)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ");
}

function blockLinks(html) {
  const result = [];
  for (const match of String(html || "").matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const href = clean(match[1], 2_048);
    if (href && !result.includes(href)) result.push(href);
    if (result.length >= 12) break;
  }
  return result;
}

function contentBlocks(source) {
  const html = mainContentHtml(source);
  const matches = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].slice(0, 300);
  const blocks = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const heading = clean(match[2], 300);
    if (!heading) continue;
    const level = Number(match[1]);
    const start = Number(match.index || 0) + match[0].length;
    let end = html.length;
    for (let nextIndex = index + 1; nextIndex < matches.length; nextIndex += 1) {
      const next = matches[nextIndex];
      if (Number(next[1]) <= level) {
        end = Number(next.index || html.length);
        break;
      }
    }
    const blockHtml = html.slice(start, end).slice(0, 24_000);
    const text = clean(blockHtml, 4_000);
    blocks.push({
      level,
      heading,
      text,
      links: blockLinks(blockHtml),
    });
  }
  return uniqueBy(blocks, (item) => `${item.level}|${item.heading.toLocaleLowerCase("en-US")}|${item.text.slice(0, 120).toLocaleLowerCase("en-US")}`);
}

export function extractHotelPageStructureV2(html = "") {
  const source = String(html || "");
  const headings = [];
  for (const match of source.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = clean(match[2], 300);
    if (!text) continue;
    headings.push({ level: Number(match[1]), text });
    if (headings.length >= 300) break;
  }

  const jsonLdEntities = [];
  for (const match of source.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = String(match[1] || "").trim();
    if (!raw || raw.length > 500_000) continue;
    try { collectJsonLdEntities(JSON.parse(raw), jsonLdEntities); }
    catch { /* Invalid third-party JSON-LD is not authority. */ }
    if (jsonLdEntities.length >= 300) break;
  }

  return {
    headings: uniqueBy(headings, (item) => `${item.level}|${item.text.toLocaleLowerCase("en-US")}`),
    jsonLdEntities: uniqueBy(jsonLdEntities, (item) => `${item.name.toLocaleLowerCase("en-US")}|${item.types.join(",")}`),
    contentBlocks: contentBlocks(source),
  };
}
