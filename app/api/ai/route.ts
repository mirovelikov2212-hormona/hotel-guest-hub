import { NextResponse } from "next/server";
import { AI_COPY } from "@/lib/ai/copy";
import { buildAiAnswer } from "@/lib/ai/answer-builder";
import { buildAiCatalog } from "@/lib/ai/catalog";
import { getCachedCatalog } from "@/lib/ai/cache";
import { deterministicRoute } from "@/lib/ai/fallback";
import { consumeAiRateLimit } from "@/lib/ai/rate-limit";
import { routeWithOpenAi } from "@/lib/ai/router";
import { normalizeAiLang, type AiDiagnostics, type AiHistoryTurn } from "@/lib/ai/types";
import { getHotelConfig } from "@/lib/config";

export const runtime = "nodejs";

const MAX_QUESTION_LENGTH = 500;
const MAX_HISTORY_TURNS = 6;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sanitizeHistory(value: unknown): AiHistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : null;
      const content = clean(item?.content).slice(0, 700);
      return role && content ? { role, content } : null;
    })
    .filter((item): item is AiHistoryTurn => Boolean(item))
    .slice(-MAX_HISTORY_TURNS);
}

function isGreeting(question: string) {
  return /^(здравей|здрасти|добър ден|hello|hi|hey|hallo|guten tag|bună|buna|salut|ahoj|dobrý den|привет|здравствуйте)[!.?\s]*$/iu.test(question);
}

function isThanks(question: string) {
  return /^(благодаря|мерси|thanks|thank you|danke|mulțumesc|multumesc|děkuji|dekuji|спасибо)[!.?\s]*$/iu.test(question);
}

const GREETING: Record<string, string> = {
  bg: "Здравейте! Попитайте ме за услугите, обектите, работното време, правилата и информацията за хотела.",
  en: "Hello! Ask me about the hotel's services, venues, opening hours, rules and information.",
  de: "Hallo! Fragen Sie mich nach Services, Bereichen, Öffnungszeiten, Regeln und Informationen zum Hotel.",
  ro: "Bună! Întrebați-mă despre serviciile, locațiile, programul, regulile și informațiile hotelului.",
  cs: "Dobrý den! Zeptejte se mě na služby, provozovny, otevírací dobu, pravidla a informace o hotelu.",
  ru: "Здравствуйте! Спросите меня об услугах, объектах, часах работы, правилах и информации об отеле.",
};

const THANKS: Record<string, string> = {
  bg: "Моля! На разположение съм за въпроси, свързани с хотела.",
  en: "You're welcome! I am here for questions related to the hotel.",
  de: "Gern! Ich helfe Ihnen bei Fragen rund um das Hotel.",
  ro: "Cu plăcere! Vă pot ajuta cu întrebări despre hotel.",
  cs: "Rádo se stalo! Pomohu vám s dotazy týkajícími se hotelu.",
  ru: "Пожалуйста! Я помогу с вопросами, связанными с отелем.",
};

function isWeatherQuestion(question: string) {
  return /(време|прогноза|температур|weather|forecast|temperature|wetter|temperatur|vreme|prognoz|počas|pocasi|погод|температур)/iu.test(question);
}

function weatherCode(code: number, lang: string) {
  const group = code === 0 ? "clear" : code <= 3 ? "cloudy" : code <= 48 ? "fog" : code <= 67 ? "rain" : code <= 77 ? "snow" : code <= 82 ? "showers" : "storm";
  const labels: Record<string, Record<string, string>> = {
    clear: { bg: "ясно", en: "clear", de: "klar", ro: "senin", cs: "jasno", ru: "ясно" },
    cloudy: { bg: "облачно", en: "cloudy", de: "bewölkt", ro: "înnorat", cs: "oblačno", ru: "облачно" },
    fog: { bg: "мъгла", en: "foggy", de: "neblig", ro: "ceață", cs: "mlha", ru: "туман" },
    rain: { bg: "дъжд", en: "rain", de: "Regen", ro: "ploaie", cs: "déšť", ru: "дождь" },
    snow: { bg: "сняг", en: "snow", de: "Schnee", ro: "ninsoare", cs: "sníh", ru: "снег" },
    showers: { bg: "превалявания", en: "showers", de: "Schauer", ro: "averse", cs: "přeháňky", ru: "ливни" },
    storm: { bg: "гръмотевична буря", en: "thunderstorm", de: "Gewitter", ro: "furtună", cs: "bouřka", ru: "гроза" },
  };
  return labels[group]?.[lang] || labels[group]?.en || "";
}

async function weatherAnswer(request: Request, hotelSlug: string, lang: string) {
  const config = await getHotelConfig(hotelSlug);
  if (!config) return AI_COPY[normalizeAiLang(lang)].noData;
  const url = new URL("/api/weather", request.url);
  if (config.hotelLatitude != null) url.searchParams.set("lat", String(config.hotelLatitude));
  if (config.hotelLongitude != null) url.searchParams.set("lon", String(config.hotelLongitude));
  if (config.location?.query) url.searchParams.set("query", config.location.query);
  if (config.hotelTimezone) url.searchParams.set("tz", config.hotelTimezone);
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!data?.ok) return AI_COPY[normalizeAiLang(lang)].noData;
  const current = data.current || {};
  const condition = weatherCode(Number(current.weatherCode || 0), lang);
  const templates: Record<string, string> = {
    bg: `В момента е ${condition}, ${current.temperature ?? "–"}°C (усеща се като ${current.apparentTemperature ?? "–"}°C).`,
    en: `It is currently ${condition}, ${current.temperature ?? "–"}°C (feels like ${current.apparentTemperature ?? "–"}°C).`,
    de: `Aktuell ist es ${condition}, ${current.temperature ?? "–"}°C (gefühlt ${current.apparentTemperature ?? "–"}°C).`,
    ro: `În prezent este ${condition}, ${current.temperature ?? "–"}°C (se simte ca ${current.apparentTemperature ?? "–"}°C).`,
    cs: `Aktuálně je ${condition}, ${current.temperature ?? "–"}°C (pocitově ${current.apparentTemperature ?? "–"}°C).`,
    ru: `Сейчас ${condition}, ${current.temperature ?? "–"}°C (ощущается как ${current.apparentTemperature ?? "–"}°C).`,
  };
  return templates[lang] || templates.en;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const question = clean(body?.question ?? body?.message ?? body?.prompt ?? body?.text);
    const lang = normalizeAiLang(body?.lang);
    const hotelSlug = clean(body?.hotelSlug ?? body?.hotel?.hotelSlug ?? body?.hotel?.slug).toLowerCase();
    const history = sanitizeHistory(body?.history);

    if (!hotelSlug) {
      return NextResponse.json({ ok: false, answer: AI_COPY[lang].error, error: "missing_hotel_slug" }, { status: 400 });
    }
    if (!question) {
      return NextResponse.json({ ok: true, answer: GREETING[lang], hotelOnly: true, aiPowered: false });
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      return NextResponse.json({ ok: false, answer: AI_COPY[lang].error, error: "question_too_long" }, { status: 400 });
    }

    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
    const limit = consumeAiRateLimit(`${hotelSlug}:${forwardedFor}`);
    if (!limit.allowed) {
      return NextResponse.json({ ok: false, answer: AI_COPY[lang].rateLimited, error: "rate_limited" }, { status: 429 });
    }

    if (isGreeting(question)) {
      return NextResponse.json({ ok: true, answer: GREETING[lang], hotelOnly: true, aiPowered: false });
    }
    if (isThanks(question)) {
      return NextResponse.json({ ok: true, answer: THANKS[lang], hotelOnly: true, aiPowered: false });
    }
    if (isWeatherQuestion(question)) {
      const answer = await weatherAnswer(request, hotelSlug, lang);
      return NextResponse.json({
        ok: true,
        answer,
        hotelOnly: true,
        aiPowered: false,
        diagnostics: {
          engine: "deterministic",
          fallbackUsed: false,
          matchedIds: ["hotel:weather"],
          catalogCount: 0,
          cacheHit: false,
          latencyMs: Date.now() - startedAt,
          intent: "weather",
        } satisfies AiDiagnostics,
      });
    }

    const { catalog, cacheHit } = await getCachedCatalog(hotelSlug, async () => {
      const config = await getHotelConfig(hotelSlug);
      if (!config) throw new Error(`Hotel configuration not found: ${hotelSlug}`);
      return buildAiCatalog(config);
    });

    let engine: AiDiagnostics["engine"] = "openai";
    let fallbackUsed = false;
    let model: string | undefined;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let routerLatency = 0;
    let routerError: string | undefined;
    let routed;

    try {
      const openAiResult = await routeWithOpenAi({ question, lang, catalog, history });
      routed = openAiResult.result;
      model = openAiResult.model;
      inputTokens = openAiResult.inputTokens;
      outputTokens = openAiResult.outputTokens;
      routerLatency = openAiResult.latencyMs;
    } catch (error) {
      const rawError = error instanceof Error ? error.message : String(error);
      routerError = rawError.startsWith("openai_") ? rawError : "openai_request_failed";
      console.error("OpenAI hotel router failed; using safe fallback", {
        hotelSlug,
        error: rawError,
      });
      engine = "fallback";
      fallbackUsed = true;
      routed = deterministicRoute(question, lang, catalog);
    }

    const answer = buildAiAnswer(routed, lang, catalog);
    const diagnostics: AiDiagnostics = {
      engine,
      model,
      fallbackUsed,
      matchedIds: routed.selected_ids,
      catalogCount: catalog.records.length,
      cacheHit,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
      intent: routed.intent,
      confidence: routed.confidence,
      routerError,
    };

    return NextResponse.json({
      ok: true,
      answer,
      hotelOnly: true,
      aiPowered: engine === "openai",
      diagnostics,
      routerLatencyMs: routerLatency,
    });
  } catch (error) {
    console.error("StayHub AI request failed", error);
    return NextResponse.json(
      { ok: false, answer: AI_COPY.en.error, error: error instanceof Error ? error.message : "server_error" },
      { status: 500 }
    );
  }
}
