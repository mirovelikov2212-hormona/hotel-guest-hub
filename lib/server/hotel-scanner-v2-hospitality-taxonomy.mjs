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
const POOL = /(?:\bpool(?:s)?\b|\bswimming pool\b|\bhavuz(?:lar)?\b|\byüzme havuzu\b|\bбасейн(?:и)?\b|\bschwimmbad\b|\bpiscin(?:a|e|ă)\b)/iu;
const AQUAPARK = /(?:\baqua\s*park\b|\baquapark\b|\bwater\s*park\b|\bsu\s*park[ıi]\b|\bakvapark\b|\bаквапарк\b)/iu;
const KIDS = /(?:\bkids?\s*(?:club|corner|area|zone)\b|\bchildren(?:'s)?\s*(?:club|corner|area|zone)\b|\bmini\s*(?:club|disco)\b|\bplayground\b|\bplay\s*area\b|\bçocuk\s*(?:kulübü|kulubu|alanı|alani|oyun alanı|oyun alani)\b|\bmini\s*(?:kulüp|kulup|disko)\b|\bдетски\s*(?:кът|клуб|зона|площадка)\b|\bminiclub\b)/iu;
const SPORTS = /(?:\bsports?\b|\bfitness\b|\bgym\b|\btennis\b|\bvolleyball\b|\bbeach volleyball\b|\bfootball\b|\bsoccer\b|\bbasketball\b|\bmultifunctional playground\b|\bspor\b|\bspor salonu\b|\btenis\b|\bvoleybol\b|\bfutbol\b|\bbasketbol\b|\bфитнес\b|\bспорт\b|\bтенис\b|\bволейбол\b|\bфутбол\b)/iu;
const ENTERTAINMENT = /(?:\banimation\b|\bentertainment\b|\bshows?\b|\bpart(?:y|ies)\b|\bmini\s*disco\b|\banimasyon\b|\beğlence\b|\beglence\b|\bgösteri\b|\bgosteri\b|\bанимация\b|\bшоу\b|\bзабавления\b)/iu;
const BEACH = /(?:\bbeach\b|\bplaj\b|\bstrand\b|\bплаж\b)/iu;

const ROOM = /(?:\broom\b|\bsuite\b|\bstudio\b|\bapartment\b|\bvilla\b|\bzimmer\b|\bcamer[ăa]\b|\bpokoj\b|\boda\b|\bodalar\b|\bsüit\b|\bsuit\b|\baile odas[ıi]\b|\bстая\b|\bстаи\b|\bапартамент\b|\bвила\b)/iu;
const RESTAURANT = /(?:\brestaurant\b|\brestoran\b|\blokanta\b|\bristorante\b|\brestaurante?\b|\brestaurace\b|\bресторант\b)/iu;
const BAR = /(?:\bbar\b|\bcafe\b|\bcafé\b|\bkafe\b|\bbistro\b|\bpub\b|\blounge\b|\bsnack bar\b|\bкафе\b|\bбар\b)/iu;
const OPERATIONAL_SERVICE = /(?:\bparking\b|\botopark\b|\btransfer\b|\bairport transfer\b|\bhavaliman[ıi] transfer\b|\blaundry\b|\bçamaşırhane\b|\bcamasirhane\b|\breception\b|\bresepsiyon\b|\bwi-?fi\b|\bwireless\b|\bshop\b|\bstore\b|\bmağaza\b|\bmagaza\b|\bexchange\b|\bcurrency exchange\b|\bdöviz\b|\bdoviz\b|\bhairdresser\b|\bkuaför\b|\bkuafor\b|\bbeauty salo+n\b|\bgüzellik salonu\b|\bguzellik salonu\b|\bmedical service\b|\bdoctor\b|\bdoktor\b|\bпаркинг\b|\bтрансфер\b|\bпералн\b|\bрецепция\b|\bмагазин\b|\bобменно бюро\b|\bфризьор\b)/iu;

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
  if (KIDS.test(name)) return { domain: "experiences", entityType: "kids_facility" };
  if (SPORTS.test(name)) return { domain: "experiences", entityType: "sports_facility" };
  if (ENTERTAINMENT.test(name)) return { domain: "experiences", entityType: "entertainment" };
  if (BEACH.test(name)) return { domain: "experiences", entityType: "beach" };

  if (WELLNESS_CORE.test(name) || (primaryDomain === "spa" && WELLNESS_CORE.test(text))) {
    return { domain: "spa", entityType: /(?:massage|masaj|treatment|therapy|terapi|ритуал|масаж|терап)/iu.test(text) ? "treatment_category" : "spa_facility" };
  }
  if (OPERATIONAL_SERVICE.test(name)) return { domain: "services", entityType: "service" };
  return null;
}

export const HOTEL_COMMON_OBJECT_PATTERNS_V2 = Object.freeze({
  room: ROOM,
  restaurant: RESTAURANT,
  bar: BAR,
  pool: POOL,
  aquapark: AQUAPARK,
  kids: KIDS,
  sports: SPORTS,
  entertainment: ENTERTAINMENT,
  beach: BEACH,
  wellness: WELLNESS_CORE,
  service: OPERATIONAL_SERVICE,
});
