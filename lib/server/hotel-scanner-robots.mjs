function clean(value, max = 4_096) {
  const text = String(value ?? "").normalize("NFKC").trim();
  return text.length <= max ? text : text.slice(0, max);
}

function groupRobots(textValue) {
  const groups = [];
  let current = null;
  let seenDirective = false;

  for (const rawLine of String(textValue || "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const field = line.slice(0, separator).trim().toLocaleLowerCase("en-US");
    const value = clean(line.slice(separator + 1));

    if (field === "user-agent") {
      if (!current || seenDirective) {
        current = { agents: [], rules: [] };
        groups.push(current);
        seenDirective = false;
      }
      if (value) current.agents.push(value.toLocaleLowerCase("en-US"));
      continue;
    }

    if (!current) continue;
    if (field === "allow" || field === "disallow") {
      seenDirective = true;
      if (!value && field === "disallow") continue;
      current.rules.push({ allow: field === "allow", pattern: value });
    }
  }
  return groups;
}

function ruleRegex(pattern) {
  const source = clean(pattern);
  if (!source) return null;
  const anchoredEnd = source.endsWith("$");
  const body = anchoredEnd ? source.slice(0, -1) : source;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  try { return new RegExp(`^${escaped}${anchoredEnd ? "$" : ""}`); }
  catch { return null; }
}

function selectedRules(textValue, userAgentToken) {
  const token = clean(userAgentToken).toLocaleLowerCase("en-US");
  const groups = groupRobots(textValue);
  const exact = groups.filter((group) => group.agents.some((agent) => agent === token || token.startsWith(`${agent}/`)));
  const selected = exact.length ? exact : groups.filter((group) => group.agents.includes("*"));
  return selected.flatMap((group) => group.rules);
}

export function buildHotelScannerRobotsPolicy(textValue, userAgentToken = "stayhub-hotel-scanner") {
  const rules = selectedRules(textValue, userAgentToken)
    .map((rule) => ({ ...rule, regex: ruleRegex(rule.pattern) }))
    .filter((rule) => rule.regex);
  const sitemaps = [];
  const seen = new Set();
  const regex = /^\s*sitemap\s*:\s*(\S+)\s*$/gim;
  let match;
  while ((match = regex.exec(String(textValue || ""))) && sitemaps.length < 20) {
    const value = clean(match[1], 2_048);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    sitemaps.push(value);
  }
  return {
    schemaVersion: "hotel-scanner-robots-v1",
    userAgentToken: clean(userAgentToken).toLocaleLowerCase("en-US"),
    rules: rules.map(({ allow, pattern }) => ({ allow, pattern })),
    _compiledRules: rules,
    sitemaps,
  };
}

export function isHotelScannerRobotsAllowed(rawUrl, policy) {
  let path;
  try {
    const url = new URL(String(rawUrl || ""));
    path = `${url.pathname}${url.search}` || "/";
  } catch {
    return false;
  }
  const rules = Array.isArray(policy?._compiledRules)
    ? policy._compiledRules
    : (policy?.rules || []).map((rule) => ({ ...rule, regex: ruleRegex(rule.pattern) })).filter((rule) => rule.regex);
  let winner = null;
  for (const rule of rules) {
    const match = path.match(rule.regex);
    if (!match) continue;
    const specificity = clean(rule.pattern).replace(/[*$]/g, "").length;
    if (!winner || specificity > winner.specificity || (specificity === winner.specificity && rule.allow && !winner.allow)) {
      winner = { allow: Boolean(rule.allow), specificity };
    }
  }
  return winner ? winner.allow : true;
}
