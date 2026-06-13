import type { AiCatalogRecord, AiHotelCatalog, AiLang, AiRouterResult } from "@/lib/ai/types";

function normalize(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}


function tokenMatches(left: string, right: string) {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5) return false;
  let common = 0;
  const limit = Math.min(left.length, right.length);
  while (common < limit && left[common] === right[common]) common += 1;
  return common >= 5 && common / Math.min(left.length, right.length) >= 0.6;
}

function recordPhrases(record: AiCatalogRecord, lang: AiLang) {
  const allLangAliases = Object.values(record.aliases).flatMap((items) => items || []);
  const allTitles = Object.values(record.titles).filter(Boolean) as string[];
  return Array.from(new Set([
    ...(record.aliases[lang] || []),
    record.titles[lang] || "",
    ...allLangAliases,
    ...allTitles,
    ...record.intentTags,
  ].map(normalize).filter(Boolean)));
}

function scoreRecord(record: AiCatalogRecord, question: string, lang: AiLang) {
  const q = normalize(question);
  const qTokens = new Set(tokens(question));
  let score = 0;
  let exactPhrase = false;

  for (const phrase of recordPhrases(record, lang)) {
    if (!phrase) continue;
    if (q === phrase) {
      score = Math.max(score, 1000);
      exactPhrase = true;
      continue;
    }
    if (phrase.length >= 4 && q.includes(phrase)) {
      score = Math.max(score, 700 + Math.min(phrase.length, 100));
      exactPhrase = true;
    }
    const phraseTokens = tokens(phrase);
    if (!phraseTokens.length) continue;
    const questionTokens = Array.from(qTokens);
    const overlap = phraseTokens.filter((token) => questionTokens.some((questionToken) => tokenMatches(token, questionToken))).length;
    const coverage = overlap / phraseTokens.length;
    if (overlap >= 2 || (overlap === 1 && phraseTokens.length === 1 && phraseTokens[0].length >= 5)) {
      score = Math.max(score, overlap * 80 + coverage * 100);
    }
  }

  return { record, score, exactPhrase };
}

export function deterministicRoute(question: string, lang: AiLang, catalog: AiHotelCatalog): AiRouterResult {
  const ranked = catalog.records
    .map((record) => scoreRecord(record, question, lang))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.score < 180) {
    return {
      status: "not_found",
      selected_ids: [],
      intent: "unknown",
      clarification: "",
      confidence: 0,
    };
  }

  const ambiguous = second && second.score >= Math.max(180, top.score - 45);
  if (ambiguous && !top.exactPhrase) {
    return {
      status: "clarify",
      selected_ids: [],
      intent: "ambiguous",
      clarification: "",
      confidence: Math.min(0.7, top.score / 1000),
    };
  }

  return {
    status: "answer",
    selected_ids: [top.record.id],
    intent: top.record.intentTags[0] || top.record.kind,
    clarification: "",
    confidence: Math.min(0.99, top.score / 1000),
  };
}
