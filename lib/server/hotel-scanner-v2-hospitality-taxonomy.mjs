const clean = (value, max = 1000) =>
  String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);

const searchable = (value, max = 2000) =>
  clean(value, max)
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

const QUESTION_HEADING = /(?:\?|^(?:does|do|is|are|can|could|may|what|where|when|how|which|who)\b|^(?:има ли|предлага ли|може ли|как|къде|кога|кой|коя|какво)(?:\s|$)|^(?:gibt es|bietet|kann|wie|wo|wann|welche?r?)(?:\s|$)|^(?:exista|ofera|se poate|cum|unde|cand|care)(?:\s|$)|^(?:var mi|sunuyor mu|sunuluyor mu|mumkun mu|nasil|nerede|ne zaman|hangi)(?:\s|$))/iu;
const AWARD_RECOGNITION = /(?:awards?|award-winning|certificate|certification|recognition|tripadvisor|holidaycheck|travelife|odul(?:ler|u)?|sertifika(?:lar)?|auszeichnung(?:en)?|preise?|nagrod(?:a|y)|награди?|сертификат(?:и)?)/iu;

const WELLNESS_CORE = /(?:\bspa\b|\bwellness\b|\bhamam\b|\bhammam\b|\bsauna\b|\bsteam(?: room| bath)?\b|\bmassage\b|\bmasaj\b|\bterapi\b|\btreatment\b|\btherapy\b|\britual\b|\bmedical spa\b|\bbalneo\b|уелнес|спа|масаж|сауна|терап)/iu;
const POOL = /(?:\bpool(?:s)?\b|\bswimming pool\b|\bhavuz(?:lar)?\b|\byuzme havuzu\b|басейн(?:и)?|\bschwimmbad\b|\bpiscin(?:a|e|a)\b)/iu;
const JACUZZI = /(?:\bjacuzzi\b|\bjakuzi\b|\bhot\s+tub\b|\bwhirlpool\b|джакузи)/iu;
const AQUAPARK = /(?:\baqua\s*park\b|\baquapark\b|\bwater\s*park\b|\bsu\s*park[ıi]\b|\bakvapark\b|аквапарк)/iu;
const KIDS = /(?:\bkids?\s*(?:club|corner|area|zone)\b|\bchildren(?:'s)?\s*(?:club|corner|area|zone)\b|\bmini\s*(?:club|disco)\b|\bplayground\b|\bplay\s*area\b|\bcocuk\s*(?:kulubu|alani|oyun alani)\b|\bmini\s*(?:kulup|disko)\b|детски\s*(?:кът|клуб|зона|площадка)|\bminiclub\b)/iu;
const GAMES = /(?:\bgame\s*(?:hall|room|area|zone)\b|\bgames\s*room\b|\barcade\b|\boyun\s*(?:salonu|odasi|alani)\b|игрална\s*(?:зала|стая|зона))/iu;
const SPORTS = /(?:\bsports?\b|\bfitness\b|\bgym\b|\btennis\b|\bvolleyball\b|\bbeach volleyball\b|\bfootball\b|\bsoccer\b|\bbasketball\b|\bmultifunctional playground\b|\bspor\b|\bspor salonu\b|\btenis\b|\bvoleybol\b|\bfutbol\b|\bbasketbol\b|фитнес|спорт|тенис|волейбол|футбол)/iu;
const ENTERTAINMENT = /(?:\banimation\b|\bentertainment\b|\bshows?\b|\bpart(?:y|ies)\b|\bmini\s*disco\b|\banimasyon\b|\beglence\b|\bgosteri\b|анимация|шоу|забавления)/iu;
const BEACH = /(?:\bbeach\b|\bplaj\b|\bstrand\b|плаж)/iu;

const ROOM = /(?:\broom\b|\bsuite\b|\bstudio\b|\bapartment\b|\bvilla\b|\bzimmer\b|\bcamera\b|\bpokoj\b|\boda\b|\bodalar\b|\bsuit\b|\baile odasi\b|стая|стаи|апартамент|вила)/iu;
const RESTAURANT = /(?:\brestaurant\b|\brestoran\b|\blokanta\b|\bristorante\b|\brestaurante?\b|\brestaurace\b|ресторант)/iu;
const BAR = /(?:\bbar\b|\bcafe\b|\bkafe\b|\bbistro\b|\bpub\b|\blounge\b|\bsnack bar\b|кафе|бар)/iu;
const OPERATIONAL_SERVICE = /(?:\bparking\b|\botopark\b|\btransfer\b|\bairport transfer\b|\bhavalimani transfer\b|\blaundry\b|\bcamasirhane\b|\breception\b|\bresepsiyon\b|\bwi-?fi\b|\bwireless\b|\bshop\b|\bstore\b|\bmagaza\b|\bexchange\b|\bcurrency exchange\b|\bdoviz\b|\bhairdresser\b|\bhair salon\b|\bbarbershop\b|\bkuafor\b|\bbeauty salo+n\b|\bguzellik salonu\b|\bmedical service\b|\bdoctor\b|\bdoktor\b|паркинг|трансфер|пералн|рецепция|магазин|обменно бюро|фризьор)/iu;

export function isFaqQuestionHeadingV2(value) {
  return QUESTION_HEADING.test(searchable(value, 300));
}

export function isAwardRecognitionHeadingV2(value) {
  return AWARD_RECOGNITION.test(searchable(value, 500));
}

export function isWellnessContextV2(value) {
  return WELLNESS_CORE.test(searchable(value, 2000));
}

export function classifyCommonHotelObjectV2(label, context = "", primaryDomain = "") {
  const displayName = clean(label, 300);
  const name = searchable(label, 300);
  const text = `${name} ${searchable(context, 2500)}`;
  if (!displayName || isFaqQuestionHeadingV2(displayName) || isAwardRecognitionHeadingV2(displayName)) return null;

  if (ROOM.test(name)) return { domain: "accommodation", entityType: "room_type" };
  if (RESTAURANT.test(name) || BAR.test(name)) return { domain: "gastronomy", entityType: RESTAURANT.test(name) ? "restaurant" : "bar" };

  if (AQUAPARK.test(name)) return { domain: "experiences", entityType: "aquapark" };
  if (POOL.test(name)) {
    return isWellnessContextV2(text) && primaryDomain === "spa"
      ? { domain: "spa", entityType: "spa_facility" }
      : { domain: "experiences", entityType: "pool" };
  }
  if (JACUZZI.test(name)) {
    return primaryDomain === "spa"
      ? { domain: "spa", entityType: "spa_facility" }
      : { domain: "experiences", entityType: "water_facility" };
  }
  if (SPORTS.test(name)) return { domain: "experiences", entityType: "sports_facility" };
  if (KIDS.test(name)) return { domain: "experiences", entityType: "kids_facility" };
  if (GAMES.test(name)) return { domain: "experiences", entityType: "games_facility" };
  if (ENTERTAINMENT.test(name)) return { domain: "experiences", entityType: "entertainment" };
  if (BEACH.test(name)) {
    const brandLike = /(?:hotel|resort|club|otel|хотел|клуб|комплекс)/iu.test(name);
    const facilityLike = /^(?:private\s+|sandy\s+|hotel\s+|resort\s+|guest\s+|exclusive\s+)?beach(?:\s+area)?$|^(?:plaj|plaji|strand|плаж)(?:\s+area|\s+alani)?$/iu.test(name);
    if (brandLike && !facilityLike) return null;
    return facilityLike
      ? { domain: "experiences", entityType: "beach" }
      : { domain: "experiences", entityType: "destination" };
  }

  if (WELLNESS_CORE.test(name) || (primaryDomain === "spa" && WELLNESS_CORE.test(text))) {
    return { domain: "spa", entityType: /(?:massage|masaj|treatment|therapy|terapi|ритуал|масаж|терап)/iu.test(text) ? "treatment_category" : "spa_facility" };
  }
  if (OPERATIONAL_SERVICE.test(name)) return { domain: "services", entityType: "service" };
  return null;
}


const SERVICE_TEXT_PATTERNS = Object.freeze([
  { name: "24/7 Reception", pattern: /(?:24\s*\/\s*7\s*)?(?:reception(?:\s+desk)?|resepsiyon|рецепц(?:ия|ията))/iu },
  { name: "Laundry & Ironing", pattern: /(?:washing\s*&?\s*ironing|laundry|camasirhane|пералн|гладен)/iu },
  { name: "Souvenir Shop", pattern: /(?:souvenir\s+shop|souvenir\s+store|hediyelik\s+esya|сувенир(?:ен|и)?\s+магазин)/iu },
  { name: "Currency Exchange", pattern: /(?:exchange\s+desk|currency\s+exchange|doviz|обменно\s+бюро|валутн(?:о|а)\s+обмен)/iu },
  { name: "Wi-Fi", pattern: /(?:\bwi[ -]?fi\b|\bwireless\s+(?:internet|connection)\b)/iu },
  { name: "Parking", pattern: /(?:\bparking\b|\botopark\b|паркинг)/iu },
  { name: "Airport Transfer", pattern: /(?:airport\s+(?:shuttle|transfer)|havalimani\s+transfer|летищен\s+трансфер)/iu },
]);

export function extractOperationalServiceLabelsV2(value) {
  const text = searchable(value, 30_000);
  const result = [];
  for (const item of SERVICE_TEXT_PATTERNS) {
    if (item.pattern.test(text)) result.push({ domain: "services", entityType: "service", name: item.name });
  }
  return result;
}


const WATER_FACILITY_TEXT_PATTERNS = Object.freeze([
  { name: "Premium Pool", entityType: "pool", pattern: /(?:\bpremium(?:\s+relax)?\s+pool\b|\bpremium\s+havuz\b|премиум\s+басейн)/iu },
  { name: "Main Pool", entityType: "pool", pattern: /(?:\bmain(?:\s+swimming)?\s+pool\b|\bana\s+havuz\b|основен\s+басейн|\bhauptpool\b|\bpiscina\s+principala\b)/iu },
  { name: "Children's Pool", entityType: "pool", pattern: /(?:\bchildren(?:['’]s)?\s+pool\b|\bkids?(?:['’])?\s+pool\b|\bcocuk\s+havuzu\b|детски\s+басейн|\bkinderpool\b|\bpiscina(?:\s+pentru)?\s+copii\b)/iu },
  { name: "Jacuzzi", entityType: "water_facility", pattern: /(?:\bjacuzzi\b|\bjakuzi\b|\bhot\s+tub\b|\bwhirlpool\b|джакузи)/iu },
]);

export function extractWaterFacilityLabelsV2(value) {
  const text = searchable(value, 30_000);
  const result = [];
  for (const item of WATER_FACILITY_TEXT_PATTERNS) {
    if (item.pattern.test(text)) {
      result.push({ domain: "experiences", entityType: item.entityType, name: item.name });
    }
  }
  return result;
}

export const HOTEL_COMMON_OBJECT_PATTERNS_V2 = Object.freeze({
  room: ROOM,
  restaurant: RESTAURANT,
  bar: BAR,
  pool: POOL,
  jacuzzi: JACUZZI,
  aquapark: AQUAPARK,
  kids: KIDS,
  games: GAMES,
  sports: SPORTS,
  entertainment: ENTERTAINMENT,
  beach: BEACH,
  wellness: WELLNESS_CORE,
  service: OPERATIONAL_SERVICE,
});
