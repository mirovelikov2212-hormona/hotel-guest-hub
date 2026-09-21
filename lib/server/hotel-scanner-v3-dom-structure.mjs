import { createHash } from "node:crypto";
import { canonicalizeHotelIntakeUrl } from "./hotel-scanner-v2-site-map.mjs";

const MAX_HTML_BYTES = 1_500_000;
const MAX_NODES = 20_000;
const MAX_DEPTH = 24;
const MAX_TEXT = 320;
const MAX_GROUPS = 96;
const MAX_ITEMS_PER_GROUP = 128;
const VOID_TAGS = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
const SKIP_TAGS = new Set(["script","style","noscript","svg","template"]);
const HEADING_TAGS = new Set(["h1","h2","h3","h4","h5","h6"]);

function clean(value, max = MAX_TEXT) {
  return String(value ?? "")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max);
}

function hash(value, size = 20) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, size);
}

function attr(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, "iu");
  const match = String(tag || "").match(pattern);
  return clean(match?.[1] || match?.[2] || match?.[3] || "", 2_048);
}

function mainHtml(source) {
  const html = String(source || "").slice(0, MAX_HTML_BYTES);
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/iu)?.[1];
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/iu)?.[1];
  return String(main || body || html)
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/giu, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/giu, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/giu, " ");
}

function node(tag, rawTag, parent, depth) {
  return {
    tag,
    role: attr(rawTag, "role").toLocaleLowerCase("en-US"),
    itemprop: attr(rawTag, "itemprop").toLocaleLowerCase("en-US"),
    href: tag === "a" ? attr(rawTag, "href") : "",
    ownText: "",
    parent,
    children: [],
    depth,
  };
}

function appendText(target, value) {
  if (!target) return;
  const text = clean(value, 160);
  if (!text) return;
  target.ownText = clean(`${target.ownText} ${text}`, MAX_TEXT);
}

function parseDom(source) {
  const html = mainHtml(source);
  const root = node("root", "", null, 0);
  const stack = [root];
  let cursor = 0;
  let nodes = 1;
  let skipDepth = 0;
  const tags = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][\w:-]*)\b[^>]*>/gu;
  let match;

  while ((match = tags.exec(html)) && nodes < MAX_NODES) {
    if (!skipDepth) appendText(stack[stack.length - 1], html.slice(cursor, match.index));
    cursor = tags.lastIndex;
    const raw = match[0];
    if (raw.startsWith("<!--") || raw.startsWith("<!")) continue;
    const tag = String(match[1] || "").toLocaleLowerCase("en-US");
    if (!tag) continue;
    const closing = /^<\//u.test(raw);

    if (SKIP_TAGS.has(tag)) {
      if (!closing) skipDepth += 1;
      else skipDepth = Math.max(0, skipDepth - 1);
      continue;
    }
    if (skipDepth) continue;

    if (closing) {
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag !== tag) continue;
        stack.length = index;
        break;
      }
      continue;
    }

    const parent = stack[stack.length - 1];
    if (!parent || parent.depth >= MAX_DEPTH) continue;
    const child = node(tag, raw, parent, parent.depth + 1);
    parent.children.push(child);
    nodes += 1;

    const selfClosing = /\/>\s*$/u.test(raw) || VOID_TAGS.has(tag);
    if (!selfClosing) stack.push(child);
  }

  if (!skipDepth) appendText(stack[stack.length - 1], html.slice(cursor));
  return root;
}

function subtreeText(target, max = 240) {
  const values = [];
  const visit = (item) => {
    if (!item || values.join(" ").length >= max) return;
    if (item.ownText) values.push(item.ownText);
    for (const child of item.children || []) visit(child);
  };
  visit(target);
  return clean(values.join(" "), max);
}

function firstDescendant(target, predicate) {
  if (!target) return null;
  for (const child of target.children || []) {
    if (predicate(child)) return child;
    const nested = firstDescendant(child, predicate);
    if (nested) return nested;
  }
  return null;
}

function primaryLink(target, baseUrl) {
  const anchor = target?.tag === "a" && target.href
    ? target
    : firstDescendant(target, (item) => item.tag === "a" && item.href);
  if (!anchor?.href) return { url: "", label: "" };
  const url = canonicalizeHotelIntakeUrl(anchor.href, baseUrl);
  return { url, label: subtreeText(anchor, 240) };
}

function primaryLabel(target) {
  const heading = target?.tag && HEADING_TAGS.has(target.tag)
    ? target
    : firstDescendant(target, (item) => HEADING_TAGS.has(item.tag));
  if (heading) {
    const value = subtreeText(heading, 240);
    if (value) return value;
  }
  const anchor = target?.tag === "a" ? target : firstDescendant(target, (item) => item.tag === "a");
  if (anchor) {
    const value = subtreeText(anchor, 240);
    if (value) return value;
  }
  return subtreeText(target, 240);
}

function roleBits(target) {
  const bits = [];
  if (target.href) bits.push("href");
  if (target.role) bits.push(`role:${target.role}`);
  if (target.itemprop) bits.push(`itemprop:${target.itemprop}`);
  return bits.sort().join(",");
}

function shape(target, depth = 0, maxDepth = 4) {
  if (!target) return "";
  const children = target.children || [];
  const head = `${target.tag}[${roleBits(target)}]`;
  if (depth >= maxDepth || !children.length) return head;
  const childShapes = children.slice(0, 12).map((child) => shape(child, depth + 1, maxDepth));
  const overflow = children.length > 12 ? `+${children.length - 12}` : "";
  return `${head}(${childShapes.join(",")}${overflow})`;
}

function subtreeStats(target) {
  let nodes = 0;
  let anchors = 0;
  let images = 0;
  let headings = 0;
  const visit = (item) => {
    if (!item || nodes >= 2_000) return;
    nodes += 1;
    if (item.tag === "a" && item.href) anchors += 1;
    if (item.tag === "img") images += 1;
    if (HEADING_TAGS.has(item.tag)) headings += 1;
    for (const child of item.children || []) visit(child);
  };
  visit(target);
  return { nodes, anchors, images, headings };
}

function templateShape(root) {
  const significant = [];
  const visit = (item, depth = 0) => {
    if (!item || significant.length >= 1_200 || depth > 8) return;
    for (const child of item.children || []) {
      significant.push(`${depth}:${child.tag}:${roleBits(child)}`);
      visit(child, depth + 1);
      if (significant.length >= 1_200) break;
    }
  };
  visit(root);
  return significant.join("|");
}

function candidateScore(group, parent, baseUrl) {
  const count = group.length;
  const items = group.map((item) => {
    const link = primaryLink(item, baseUrl);
    const stats = subtreeStats(item);
    return { link, stats, label: primaryLabel(item) };
  });
  const linked = items.filter((item) => item.link.url).length;
  const labeled = items.filter((item) => item.label).length;
  const uniqueHrefs = new Set(items.map((item) => item.link.url).filter(Boolean)).size;
  const uniqueLabels = new Set(items.map((item) => clean(item.label, 240).toLocaleLowerCase("en-US")).filter(Boolean)).size;
  const avgNodes = items.reduce((sum, item) => sum + item.stats.nodes, 0) / Math.max(1, count);

  let score = 0;
  if (count >= 2) score += 0.2;
  if (count >= 3) score += 0.15;
  if (count >= 5) score += 0.1;
  score += 0.2 * (linked / count);
  score += 0.15 * (labeled / count);
  if (uniqueHrefs >= Math.max(2, Math.ceil(count * 0.6))) score += 0.15;
  if (uniqueLabels >= Math.max(2, Math.ceil(count * 0.6))) score += 0.1;
  if (avgNodes >= 3) score += 0.05;
  if ((parent?.children || []).length === count) score += 0.05;
  return Math.min(1, Number(score.toFixed(3)));
}

function repeatedSiblingGroups(root, baseUrl) {
  const groups = [];
  let sequence = 0;

  const visit = (parent) => {
    const children = parent?.children || [];
    if (children.length >= 2) {
      const byShape = new Map();
      for (const child of children) {
        const stats = subtreeStats(child);
        if (stats.nodes < 2) continue;
        if (!primaryLabel(child)) continue;
        const rawShape = shape(child);
        const fingerprint = hash(rawShape);
        if (!byShape.has(fingerprint)) byShape.set(fingerprint, { fingerprint, rawShape, values: [] });
        byShape.get(fingerprint).values.push(child);
      }

      for (const entry of byShape.values()) {
        if (entry.values.length < 2) continue;
        const confidence = candidateScore(entry.values, parent, baseUrl);
        if (confidence < 0.55) continue;

        const items = [];
        const seenUrls = new Set();
        const seenInlineLabels = new Set();
        for (let index = 0; index < entry.values.length && items.length < MAX_ITEMS_PER_GROUP; index += 1) {
          const item = entry.values[index];
          const link = primaryLink(item, baseUrl);
          const label = primaryLabel(item) || link.label;
          if (!label) continue;

          if (link.url) {
            if (seenUrls.has(link.url)) continue;
            seenUrls.add(link.url);
            items.push({
              url: link.url,
              label,
              inlineKey: "",
              ordinal: index,
              fingerprint: entry.fingerprint,
            });
            continue;
          }

          const normalizedLabel = clean(label, 240).toLocaleLowerCase("en-US");
          if (!normalizedLabel || seenInlineLabels.has(normalizedLabel)) continue;
          seenInlineLabels.add(normalizedLabel);
          items.push({
            url: "",
            label,
            inlineKey: `inline:${hash(`${baseUrl}|${entry.fingerprint}|${normalizedLabel}`, 24)}`,
            ordinal: index,
            fingerprint: entry.fingerprint,
          });
        }
        if (items.length < 2) continue;

        const linkedCount = items.filter((item) => item.url).length;
        const inlineCount = items.length - linkedCount;
        if (!linkedCount && items.length < 3) continue;

        groups.push({
          id: `dom-group-${sequence++}`,
          fingerprint: entry.fingerprint,
          parentFingerprint: hash(shape(parent, 0, 2)),
          tag: entry.values[0]?.tag || "",
          count: items.length,
          confidence,
          items,
          evidence: {
            source: "repeated_dom_siblings",
            siblingCount: entry.values.length,
            uniqueLinkCount: linkedCount,
            inlineCount,
            memberMode: linkedCount && inlineCount ? "mixed" : linkedCount ? "linked" : "inline",
          },
        });
        if (groups.length >= MAX_GROUPS) return;
      }
    }

    for (const child of children) {
      if (groups.length >= MAX_GROUPS) break;
      visit(child);
    }
  };

  visit(root);
  return groups
    .sort((left, right) => right.confidence - left.confidence || right.count - left.count || left.id.localeCompare(right.id))
    .slice(0, MAX_GROUPS);
}

export function extractHotelDomStructureV3(html = "", baseUrl = "") {
  const root = parseDom(html);
  const template = templateShape(root);
  const repeatedStructures = repeatedSiblingGroups(root, baseUrl);
  return {
    schemaVersion: "hotel-scanner-v3-dom-structure-1",
    templateFingerprint: hash(template, 24),
    repeatedStructures,
    counts: {
      repeatedStructures: repeatedStructures.length,
      repeatedItems: repeatedStructures.reduce((sum, group) => sum + group.count, 0),
    },
  };
}
