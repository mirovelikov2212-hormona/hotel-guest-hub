import { AI_COPY } from "@/lib/ai/copy";
import type { AiCatalogRecord, AiHotelCatalog, AiLang, AiRouterResult } from "@/lib/ai/types";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function localized(map: Partial<Record<AiLang, string>> | undefined, lang: AiLang) {
  return clean(map?.[lang] || map?.bg || map?.en || map?.de || map?.ro || map?.cs || map?.ru);
}

function listLocalized(map: Partial<Record<AiLang, string[]>> | undefined, lang: AiLang) {
  return unique(map?.[lang] || map?.bg || map?.en || []);
}

function recordLines(record: AiCatalogRecord, lang: AiLang) {
  const copy = AI_COPY[lang];
  const title = localized(record.titles, lang) || record.id;
  const summary = localized(record.summaries, lang);
  const hours = localized(record.hoursByLang, lang);
  const options = listLocalized(record.optionsByLang, lang);
  const path = unique(record.pathByLang[lang] || []);
  const lines = [`• ${title}`];

  if (record.kind === "service" && !summary) lines.push(copy.available);
  if (summary) lines.push(summary);
  if (hours) lines.push(`${copy.hours}: ${hours}`);
  if (record.price) lines.push(`${copy.price}: ${record.price}`);
  if (options.length) lines.push(`${copy.options}: ${options.join("; ")}`);
  if (path.length) lines.push(`${copy.path}: ${path.join(" → ")}`);
  for (const url of record.urls) lines.push(url);
  if (record.kind === "service" && record.requestKind !== "info_only") lines.push(copy.requestHint);

  return lines.join("\n");
}

export function buildAiAnswer(result: AiRouterResult, lang: AiLang, catalog: AiHotelCatalog) {
  const copy = AI_COPY[lang];
  if (result.status === "out_of_scope") return copy.outOfScope;
  if (result.status === "not_found") return copy.noData;
  if (result.status === "clarify") return clean(result.clarification) || copy.clarify;

  const byId = new Map(catalog.records.map((record) => [record.id, record]));
  const selected = result.selected_ids.map((id) => byId.get(id)).filter((record): record is AiCatalogRecord => Boolean(record));
  if (!selected.length) return copy.noData;
  return selected.map((record) => recordLines(record, lang)).join("\n\n");
}
