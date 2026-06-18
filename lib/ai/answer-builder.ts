import { AI_COPY } from "@/lib/ai/copy";
import type {
  AiAnswerField,
  AiCatalogRecord,
  AiHotelCatalog,
  AiLang,
  AiRouterResult,
} from "@/lib/ai/types";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function cleanAnswerLine(value: unknown) {
  return String(value ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function uniqueAnswerLines(values: string[]) {
  return Array.from(new Set(values.map(cleanAnswerLine).filter(Boolean)));
}

function localizedRaw(map: Partial<Record<AiLang, string>> | undefined, lang: AiLang) {
  return String(map?.[lang] || map?.bg || map?.en || map?.de || map?.ro || map?.cs || map?.ru || "").trim();
}

function localized(map: Partial<Record<AiLang, string>> | undefined, lang: AiLang) {
  return clean(localizedRaw(map, lang));
}

function listLocalized(map: Partial<Record<AiLang, string[]>> | undefined, lang: AiLang) {
  return unique(map?.[lang] || map?.bg || map?.en || []);
}

function splitFacts(value: string) {
  return unique(
    String(value || "")
      .trim()
      .split(/(?:\n+|(?<=[.!?])\s+)/u)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function priceFacts(summary: string) {
  const facts = splitFacts(summary);
  const numeric = facts.filter((fact) =>
    /(?:€|eur|\$|£|лв\.?|bgn|\b\d+[.,]\d{1,2}\b)/iu.test(fact)
  );
  if (numeric.length) return numeric.slice(0, 2);

  const matched = facts.filter((fact) =>
    /(?:цена|струва|платен|безплат|price|cost|paid|free|preis|kost|kostenlos|gratuit|preț|pret|zdarma|cena|стоит|бесплат)/iu.test(
      fact
    )
  );
  return matched.length ? matched.slice(0, 2) : facts.slice(0, 1);
}

function hoursFacts(summary: string) {
  const facts = splitFacts(summary);
  const matched = facts.filter((fact) => /\b\d{1,2}[:.]\d{2}\b/u.test(fact));
  return matched.length ? matched : [];
}

function inferFields(result: AiRouterResult): AiAnswerField[] {
  if (result.requested_fields?.length) return result.requested_fields;
  const intent = clean(result.intent).toLowerCase();
  if (/price|cost|fee|paid|free|цена|струва|preis|preț|pret|cena|стоит/u.test(intent)) return ["price"];
  if (/hour|time|open|schedule|работ|час|кога|uhr|wann|orar|program|otev|время/u.test(intent)) return ["hours"];
  if (/reservation|reserve|резервац|reservier|rezerv|брони/u.test(intent)) return ["reservation"];
  if (/where|location|path|къде|местополож|standort|loca|kde|где/u.test(intent)) return ["location"];
  if (/option|type|which|вариант|какви|welche|opți|možnost|какие/u.test(intent)) return ["options"];
  if (/available|availability|offer|налич|предлаг|verfüg|disponibil|nabíz|доступ/u.test(intent)) return ["availability"];
  return ["summary"];
}

function fieldLines(record: AiCatalogRecord, field: AiAnswerField, lang: AiLang) {
  const copy = AI_COPY[lang];
  const summary = localizedRaw(record.summaries, lang);
  const hours = localized(record.hoursByLang, lang);
  const options = listLocalized(record.optionsByLang, lang);
  const path = unique(record.pathByLang[lang] || []);

  switch (field) {
    case "price": {
      if (record.price) return [`${copy.price}: ${record.price}`];
      return priceFacts(summary);
    }
    case "hours": {
      if (hours) return [`${copy.hours}: ${hours}`];
      return hoursFacts(summary);
    }
    case "reservation": {
      if (record.requiresReservation === true) return [copy.reservationRequired];
      if (record.requiresReservation === false) return [copy.reservationNotRequired];
      return [];
    }
    case "location":
      return path.length ? [`${copy.path}: ${path.join(" → ")}`] : [];
    case "options":
      return options.length
        ? [`${copy.options}:\n${options.join("\n")}`]
        : summary
          ? splitFacts(summary)
          : [];
    case "availability":
      return [copy.available];
    case "request":
      return record.kind === "service" && record.requestKind !== "info_only" ? [copy.requestHint] : [];
    case "links":
      return record.urls;
    case "summary":
    default:
      return summary ? splitFacts(summary).slice(0, 3) : record.kind === "service" ? [copy.available] : [];
  }
}

function conciseRecordAnswer(record: AiCatalogRecord, fields: AiAnswerField[], lang: AiLang, showTitle: boolean) {
  const title = localized(record.titles, lang) || record.id;
  const lines = uniqueAnswerLines(fields.flatMap((field) => fieldLines(record, field, lang)));
  if (!lines.length) return "";
  return showTitle ? [`• ${title}`, ...lines].join("\n") : lines.join("\n");
}

export function buildAiAnswer(result: AiRouterResult, lang: AiLang, catalog: AiHotelCatalog) {
  const copy = AI_COPY[lang];
  if (result.status === "out_of_scope") return copy.outOfScope;
  if (result.status === "not_found") return copy.noData;
  if (result.status === "clarify") return clean(result.clarification) || copy.clarify;

  const byId = new Map(catalog.records.map((record) => [record.id, record]));
  const selected = result.selected_ids
    .map((id) => byId.get(id))
    .filter((record): record is AiCatalogRecord => Boolean(record));
  if (!selected.length) return copy.noData;

  const fields = inferFields(result);
  const showTitle = selected.length > 1;
  const answers = selected
    .map((record) => conciseRecordAnswer(record, fields, lang, showTitle))
    .filter(Boolean);

  return answers.length ? answers.join("\n\n") : copy.noData;
}
