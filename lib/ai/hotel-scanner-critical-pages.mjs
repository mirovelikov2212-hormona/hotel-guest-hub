export const DEFAULT_MAX_CRITICAL_PAGES = 14;

const CATEGORY_RULES = [
  {
    key: "faq",
    priority: 140,
    structural: /(?:^|[\s/_-])(?:faq|frequently[\s_-]+asked|questions?|q[\s_-]*a|често[\s_-]+задав|въпроси)(?:$|[\s/_-])/iu,
    body: /(?:frequently asked questions|често задавани въпроси|въпроси и отговори)/iu,
  },
  {
    key: "policy_rules",
    priority: 136,
    structural: /(?:policy|policies|hotel[\s_-]*policy|house[\s_-]*rules?|guest[\s_-]*rules?|rules[\s_-]*of[\s_-]*stay|правил|политик)/iu,
    body: /(?:hotel policy|house rules|guest rules|правила на хотела|правила за престой|политика на хотела)/iu,
  },
  {
    key: "terms",
    priority: 132,
    structural: /(?:terms?(?:[\s_-]*(?:and|&)[\s_-]*conditions?)?|conditions?|general[\s_-]*terms?|условия|общи[\s_-]*условия)/iu,
    body: /(?:terms and conditions|general terms|общи условия|условия за ползване)/iu,
  },
  {
    key: "cancellation_payment",
    priority: 128,
    structural: /(?:cancel|cancellation|refund|payment|deposit|prepay|анулац|отказ|възстанов|плащ|капаро|депозит)/iu,
    body: /(?:cancellation|refund|deposit|payment|анулац|отказ|възстанов|плащане|капаро|депозит)/iu,
  },
  {
    key: "booking_reservation",
    priority: 124,
    structural: /(?:booking|reservation|reservations|book[\s_-]*now|резервац|резервир)/iu,
    body: /(?:booking rules|reservation rules|booking conditions|условия за резервац|правила за резервац)/iu,
  },
  {
    key: "stay_operations",
    priority: 122,
    structural: /(?:check[\s_-]*in|check[\s_-]*out|arrival|departure|hotel[\s_-]*information|guest[\s_-]*information|important[\s_-]*information|useful[\s_-]*information|настаняв|освобождав|напускан|информация[\s_-]*за[\s_-]*гости)/iu,
    body: /(?:check[\s-]*in|check[\s-]*out|настаняване|освобождаване|напускане)/iu,
  },
  {
    key: "guest_rules",
    priority: 120,
    structural: /(?:pets?|pet[\s_-]*policy|smok|non[\s_-]*smoking|quiet[\s_-]*hours?|noise|домашн.*любим|пушен|тишин|шум)/iu,
    body: /(?:pets? (?:are )?(?:allowed|not allowed|permitted|prohibited)|домашни любимци|smoking|non-smoking|пушенето|quiet hours|часове за тишина)/iu,
  },
  {
    key: "dining_venue",
    priority: 108,
    structural: /(?:restaurant|dining|gastronom|bistro|brasserie|bar(?:$|[\s/_-])|cafe|coffee[\s_-]*shop|ресторант|бар(?:$|[\s/_-])|хранен|гастроном)/iu,
    body: /(?:restaurant|dining club|restaurant hours|ресторант|работно време.*ресторант)/iu,
  },
  {
    key: "wellness_medical",
    priority: 108,
    structural: /(?:(?:^|[\s/_-])spa(?:$|[\s/_-])|wellness|medical|therapy|therapies|treatment|hydrotherapy|balneo|rehab|уелнес|спа|медицин|терап|лечение|балнео|рехабил)/iu,
    body: /(?:(?:^|\s)spa(?:$|\s)|wellness|medical|therapy|treatment|hydrotherapy|уелнес|спа|медицин|терап|лечение)/iu,
  },
  {
    key: "service_detail",
    priority: 96,
    structural: /(?:services?|facilities|guest[\s_-]*service|activities|услуги|удобства|съоръжения|активности)/iu,
    body: /(?:service details|guest services|услуги за гости|работно време.*услуг)/iu,
  },
];

function clean(value, max = 8_000) {
  const result = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return result.length <= max ? result : result.slice(0, max);
}

function normalizedUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""));
    url.hash = "";
    return url.toString();
  } catch {
    return clean(rawUrl, 2_048);
  }
}

function structuralText(page) {
  const rawUrl = normalizedUrl(page?.url);
  let decodedUrl = rawUrl;
  try { decodedUrl = decodeURIComponent(rawUrl); } catch { /* keep raw URL */ }
  return clean(`${decodedUrl} ${page?.title || ""} ${page?.description || ""}`, 6_000).toLocaleLowerCase("en-US");
}

function bodyText(page) {
  return clean(page?.text || "", 6_000).toLocaleLowerCase("en-US");
}

export function scoreCriticalHotelScannerPage(page) {
  const structural = structuralText(page);
  const body = bodyText(page);
  const categories = [];
  const structuralCategories = [];
  let score = 0;

  for (const rule of CATEGORY_RULES) {
    const structuralMatch = rule.structural.test(structural);
    const bodyMatch = rule.body.test(body);
    if (!structuralMatch && !bodyMatch) continue;
    categories.push(rule.key);
    if (structuralMatch) structuralCategories.push(rule.key);
    score += structuralMatch ? rule.priority : Math.max(24, Math.round(rule.priority * 0.34));
  }

  // Structural relevance is stronger than incidental body wording. Multiple
  // independently useful categories receive a small deterministic bonus.
  score += structuralCategories.length * 12;
  score += Math.max(0, categories.length - 1) * 5;

  return { score, categories, structuralCategories };
}

function stableRank(pages) {
  return pages
    .map((page) => ({ page, url: normalizedUrl(page?.url), ...scoreCriticalHotelScannerPage(page) }))
    .filter((item) => item.url)
    .sort((left, right) => (
      right.score - left.score
      || right.structuralCategories.length - left.structuralCategories.length
      || right.categories.length - left.categories.length
      || left.url.localeCompare(right.url, "en")
    ));
}

export function selectCriticalHotelScannerPages(pages, options = {}) {
  const requestedMax = Number(options?.maxPages ?? DEFAULT_MAX_CRITICAL_PAGES);
  const maxPages = Math.max(1, Math.min(20, Number.isFinite(requestedMax) ? Math.floor(requestedMax) : DEFAULT_MAX_CRITICAL_PAGES));

  const uniquePages = [];
  const seenUrls = new Set();
  for (const page of Array.isArray(pages) ? pages : []) {
    const url = normalizedUrl(page?.url);
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    uniquePages.push(page);
  }
  if (!uniquePages.length) return [];

  const ranked = stableRank(uniquePages);
  const relevant = ranked.filter((item) => item.score > 0);
  if (!relevant.length) return uniquePages.slice(0, Math.min(maxPages, 1));

  const selected = [];
  const selectedUrls = new Set();
  const add = (item) => {
    if (!item || selected.length >= maxPages || selectedUrls.has(item.url)) return;
    selectedUrls.add(item.url);
    selected.push(item.page);
  };

  // First guarantee representation for each critical semantic family that is
  // actually present. Prefer pages where the family is structural (URL/title/
  // description) so incidental footer/body mentions cannot crowd out the real
  // FAQ, policy, venue or service-detail page.
  for (const rule of CATEGORY_RULES) {
    if (selected.length >= maxPages) break;
    const representative = relevant.find((item) => item.structuralCategories.includes(rule.key))
      || relevant.find((item) => item.categories.includes(rule.key));
    add(representative);
  }

  // Then fill the remaining bounded budget by deterministic relevance. This
  // intentionally keeps additional language variants and independent pages:
  // they may contain genuine contradictions and must reach verification.
  for (const item of relevant) {
    if (selected.length >= maxPages) break;
    add(item);
  }

  return selected;
}