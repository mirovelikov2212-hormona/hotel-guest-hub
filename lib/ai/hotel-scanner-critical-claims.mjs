const PET_KEYWORD = /(?:\bpets?\b|домашн\p{L}*\s+любим\p{L}*|haustier\p{L}*|animale?\s+de\s+companie)/iu;
const PET_PROHIBITED = /(?:\bno\s+pets?\b|pets?\s+(?:are\s+)?not\s+(?:allowed|permitted|accepted)|not\s+(?:allowed|permitted).{0,45}pets?|forbidden|prohibit|не\s+се\s+(?:допуск|разреш|прием)|домашн\p{L}*\s+любим\p{L}*.{0,35}(?:не\s+се|забран)|keine\s+haustier|haustier\p{L}*.{0,35}(?:nicht\s+erlaubt|verboten)|animale?\s+de\s+companie.{0,35}(?:nu\s+sunt\s+permise|interzis))/iu;
const PET_ALLOWED = /(?:pets?\s+(?:are\s+)?(?:allowed|permitted|accepted|welcome)|(?:allowed|permitted|accepted).{0,45}pets?|домашн\p{L}*\s+любим\p{L}*.{0,45}(?:се\s+допуск|са\s+разреш|са\s+позвол|се\s+прием)|(?:разреш|допуск|позвол).{0,45}домашн\p{L}*\s+любим|haustier\p{L}*.{0,35}(?:erlaubt|gestattet)|animale?\s+de\s+companie.{0,35}(?:permise|acceptate))/iu;

const QUIET_KEYWORD = /(?:quiet\s+hours?|quiet\s+time|тихи\s+часове|часове\s+за\s+тишина|ruhezeit\p{L}*|ore(?:le)?\s+de\s+lini(?:ș|ş|s)te)/iu;
const CHECK_IN_KEYWORD = /(?:check[ -]?in|arrival\s+time|настаняв\p{L}*|час\p{L}*\s+за\s+настаняване|anreise|cazare)/iu;
const CHECK_OUT_KEYWORD = /(?:check[ -]?out|departure\s+time|освобождав\p{L}*|напускан\p{L}*|час\p{L}*\s+за\s+(?:освобождаване|напускане)|abreise|plecare)/iu;

const EXTERNAL_ALLOWED = /(?:(?:external|outside|non[ -]?hotel|day)\s+(?:guests?|visitors?).{0,120}(?:allowed|welcome|can|may|reservation|book)|(?:allowed|welcome).{0,80}(?:external|outside|non[ -]?hotel)\s+(?:guests?|visitors?)|външн\p{L}*\s+гост\p{L}*.{0,120}(?:могат|допуск|посещ|резервац)|oaspe\p{L}*\s+extern\p{L}*.{0,120}(?:permis|rezerv)|externe\p{L}*\s+g[aä]st\p{L}*.{0,120}(?:erlaubt|reserv))/iu;
const GUESTS_ONLY = /(?:(?:available\s+)?exclusively.{0,90}(?:resort|hotel)\s+guests?.{0,50}(?:members?)?|only.{0,70}(?:resort|hotel)\s+guests?.{0,50}(?:members?)?|само\s+за.{0,90}(?:гост\p{L}*|член\p{L}*)|exklusiv.{0,90}(?:g[aä]st\p{L}*|mitglied\p{L}*)|exclusiv.{0,90}(?:oaspe\p{L}*|membr\p{L}*))/iu;

const GENERIC_TITLE = /^(?:faq|frequently asked questions?|hotel policy|polic(?:y|ies)|terms|conditions|hotel information|guest information|home|начало|често задавани въпроси|политика|правила|условия)$/iu;
const GENERIC_CAPS = new Set(["FAQ", "SPA", "VIP", "EUR", "BG", "EN", "DE", "RO", "HOTEL", "RESORT"]);

function clean(value, max = 900) {
  const result = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return result.length <= max ? result : result.slice(0, max);
}

function normalized(value) {
  return clean(value).toLocaleLowerCase("en-US");
}

function globalRegex(pattern) {
  const flags = [...new Set(`${pattern.flags}g`.split(""))].join("");
  return new RegExp(pattern.source, flags);
}

function contextsFor(source, pattern, radius = 260) {
  const contexts = [];
  const seen = new Set();
  const regex = globalRegex(pattern);
  let match;
  while ((match = regex.exec(source)) && contexts.length < 8) {
    const start = Math.max(0, match.index - radius);
    const end = Math.min(source.length, match.index + match[0].length + radius);
    const context = clean(source.slice(start, end));
    const key = normalized(context);
    if (context && !seen.has(key)) {
      seen.add(key);
      contexts.push(context);
    }
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return contexts;
}

function clockTokens(value) {
  const tokens = [];
  const seen = new Set();
  const regex = /(?:^|\D)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/g;
  let match;
  while ((match = regex.exec(clean(value, 1_500)))) {
    const token = `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
    if (!seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }
  return tokens;
}

function localized(outputLanguage, bg, en) {
  return outputLanguage === "bg" ? bg : en;
}

function makeFact({ category, subject, attribute, label, value, url }) {
  return { category, subject, attribute, label, value, confidence: 1, sourceUrls: [url] };
}

function titleVenue(page) {
  const title = clean(page?.title, 180);
  if (!title) return "";
  const head = clean(title.split(/\s*[|–—]\s*/u)[0], 100);
  if (!head || GENERIC_TITLE.test(head)) return "";
  if (/(?:restaurant|dining|culinary|club|ресторант|кулинар|клуб|bistro|bar\b)/iu.test(head) && head.length <= 80) return head;
  return "";
}

function contextVenue(context) {
  const proper = context.match(/(?:restaurant|dining|culinary\s+club|club|ресторант|кулинарен\s+клуб|клуб)\s+([A-ZА-Я][\p{L}\d'’-]{2,}(?:\s+[A-ZА-Я][\p{L}\d'’-]{2,}){0,2})/u)?.[1];
  if (proper && !GENERIC_CAPS.has(proper.toUpperCase())) return clean(proper, 80);

  const caps = context.match(/\b[A-ZА-Я][A-ZА-Я0-9'’-]{2,}\b/gu) || [];
  for (const candidate of caps) {
    const token = clean(candidate, 80);
    if (!GENERIC_CAPS.has(token.toUpperCase())) return token;
  }
  return "";
}

function inferVenue(page, context) {
  return contextVenue(context) || titleVenue(page);
}

function operationalTime(source, keyword) {
  const regex = globalRegex(keyword);
  let match;
  while ((match = regex.exec(source))) {
    const after = source.slice(match.index + match[0].length, Math.min(source.length, match.index + match[0].length + 130));
    const afterTimes = clockTokens(after);
    if (afterTimes.length) return afterTimes[0];
    const context = source.slice(Math.max(0, match.index - 90), Math.min(source.length, match.index + match[0].length + 150));
    const times = clockTokens(context);
    if (times.length) return times[0];
  }
  return "";
}

function addFact(output, seen, fact) {
  const key = `${normalized(fact.category)}|${normalized(fact.subject)}|${normalized(fact.attribute)}|${normalized(fact.value)}|${fact.sourceUrls[0]}`;
  if (seen.has(key)) return;
  seen.add(key);
  output.push(fact);
}

export function extractHotelScannerCriticalClaims(pages = [], outputLanguage = "en") {
  const output = [];
  const seen = new Set();

  for (const page of Array.isArray(pages) ? pages : []) {
    const url = clean(page?.url, 2_048);
    const source = clean(page?.text, 80_000);
    if (!url || !source) continue;

    for (const context of contextsFor(source, PET_KEYWORD, 230)) {
      if (PET_PROHIBITED.test(context)) {
        addFact(output, seen, makeFact({
          category: "policy", subject: "hotel", attribute: "pet_policy",
          label: localized(outputLanguage, "Домашни любимци", "Pet policy"),
          value: localized(outputLanguage, "Домашни любимци не се допускат.", "Pets are not allowed."), url,
        }));
      } else if (PET_ALLOWED.test(context)) {
        addFact(output, seen, makeFact({
          category: "policy", subject: "hotel", attribute: "pet_policy",
          label: localized(outputLanguage, "Домашни любимци", "Pet policy"),
          value: localized(outputLanguage, "Домашни любимци се допускат.", "Pets are allowed."), url,
        }));
      }
    }

    for (const context of contextsFor(source, QUIET_KEYWORD, 260)) {
      const times = clockTokens(context).slice(0, 6);
      if (times.length < 2) continue;
      const ranges = [];
      for (let index = 0; index + 1 < times.length; index += 2) ranges.push(`${times[index]}–${times[index + 1]}`);
      if (!ranges.length) continue;
      addFact(output, seen, makeFact({
        category: "policy", subject: "hotel", attribute: "quiet_hours",
        label: localized(outputLanguage, "Тихи часове", "Quiet hours"),
        value: ranges.join(localized(outputLanguage, " и ", " and ")), url,
      }));
    }

    const checkIn = operationalTime(source, CHECK_IN_KEYWORD);
    if (checkIn) addFact(output, seen, makeFact({
      category: "operations", subject: "hotel", attribute: "check_in",
      label: localized(outputLanguage, "Настаняване", "Check-in"), value: checkIn, url,
    }));
    const checkOut = operationalTime(source, CHECK_OUT_KEYWORD);
    if (checkOut) addFact(output, seen, makeFact({
      category: "operations", subject: "hotel", attribute: "check_out",
      label: localized(outputLanguage, "Освобождаване", "Check-out"), value: checkOut, url,
    }));

    const accessContexts = [
      ...contextsFor(source, EXTERNAL_ALLOWED, 220).map((context) => ({ context, state: "allowed" })),
      ...contextsFor(source, GUESTS_ONLY, 220).map((context) => ({ context, state: "guests_only" })),
    ];
    for (const { context, state } of accessContexts) {
      const venue = inferVenue(page, context);
      if (!venue) continue;
      addFact(output, seen, makeFact({
        category: "dining", subject: venue, attribute: "external_access",
        label: localized(outputLanguage, "Достъп", "External access"),
        value: state === "allowed"
          ? localized(outputLanguage, "Външни гости се допускат с резервация.", "External guests are allowed with reservation.")
          : localized(outputLanguage, "Достъпно само за гости на курорта и членове.", "Available only to resort guests and members."),
        url,
      }));
    }
  }

  return output.slice(0, 48);
}
