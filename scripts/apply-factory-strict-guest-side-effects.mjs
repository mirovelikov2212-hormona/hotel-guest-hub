import fs from "node:fs";

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing guarded source block: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Guarded source block is not unique: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const guestHubPath = "components/GuestHub.tsx";
let guestHub = fs.readFileSync(guestHubPath, "utf8");

guestHub = replaceOnce(
  guestHub,
  [
    "export default function GuestHub({ config }: { config: HotelConfig }) {",
    "  const guestRuntimeCapabilities = useMemo(",
    "    () => deriveGuestRuntimeCapabilities({",
    "      hotelSlug: config.hotelSlug,",
    "      publicSlug: config.publicSlug,",
    "      coverImage: config.coverImage,",
    "      requestDefs: config.requestDefs,",
    "    }),",
    "    [config.coverImage, config.hotelSlug, config.publicSlug, config.requestDefs]",
    "  );",
  ].join("\n"),
  [
    "export default function GuestHub({ config }: { config: HotelConfig }) {",
    "  const factoryOnboardingEnvelope = (config as any).factoryOnboardingEnvelope;",
    "  const explicitWeatherEnabled = (config as any).weatherEnabled;",
    "  const guestRuntimeCapabilities = useMemo(",
    "    () => deriveGuestRuntimeCapabilities({",
    "      hotelSlug: config.hotelSlug,",
    "      publicSlug: config.publicSlug,",
    "      coverImage: config.coverImage,",
    "      requestDefs: config.requestDefs,",
    "      factoryOnboardingEnvelope,",
    "      weatherEnabled: explicitWeatherEnabled,",
    "    }),",
    "    [",
    "      config.coverImage,",
    "      config.hotelSlug,",
    "      config.publicSlug,",
    "      config.requestDefs,",
    "      explicitWeatherEnabled,",
    "      factoryOnboardingEnvelope,",
    "    ]",
    "  );",
  ].join("\n"),
  "Guest capability input",
);

guestHub = replaceOnce(
  guestHub,
  [
    "function getGuestIntroCopy(lang: LangKey, hotelName?: string) {",
    "  const name = String(hotelName || \"StayHub\").trim();",
    "",
    "  const copy: Record<LangKey, { title: string; body: string; button: string }> = {",
  ].join("\n"),
  [
    "function getGuestIntroCopy(lang: LangKey, hotelName?: string, strictFactory = false) {",
    "  const name = String(hotelName || \"StayHub\").trim();",
    "",
    "  if (strictFactory) {",
    "    const strictCopy: Record<LangKey, { title: string; body: string; button: string }> = {",
    '      bg: { title: "Добре дошли в дигиталния консиерж", body: `Това е Вашият дигитален помощник по време на престоя в ${name}. Тук можете да използвате само услугите и хотелските отдели, които са активирани за Вашия престой. За да свържем услугата с Вашата стая, моля въведете номера на стаята си.`, button: "Разбрах, продължи" },',
    '      en: { title: "Welcome to your digital concierge", body: `This is your digital assistant during your stay at ${name}. Here you can use only the services and hotel departments enabled for your stay. To connect the service with your room, please enter your room number.`, button: "Got it, continue" },',
    '      de: { title: "Willkommen bei Ihrem digitalen Concierge", body: `Dies ist Ihr digitaler Assistent während Ihres Aufenthalts im ${name}. Hier können Sie nur die Services und Hotelabteilungen nutzen, die für Ihren Aufenthalt aktiviert wurden. Damit wir den Service Ihrem Zimmer zuordnen können, geben Sie bitte Ihre Zimmernummer ein.`, button: "Verstanden, weiter" },',
    '      ro: { title: "Bine ați venit la concierge-ul digital", body: `Acesta este asistentul digital pentru șederea dvs. la ${name}. Aici puteți utiliza numai serviciile și departamentele hotelului activate pentru șederea dvs. Pentru a conecta serviciul cu camera dvs., vă rugăm să introduceți numărul camerei.`, button: "Am înțeles, continuă" },',
    '      cs: { title: "Vítejte u svého digitálního concierge", body: `Toto je váš digitální asistent během pobytu v ${name}. Zde můžete využívat pouze služby a hotelová oddělení aktivovaná pro váš pobyt. Abychom službu přiřadili k vašemu pokoji, zadejte prosím číslo pokoje.`, button: "Rozumím, pokračovat" },',
    '      ru: { title: "Добро пожаловать в цифровой консьерж", body: `Это ваш цифровой помощник во время пребывания в ${name}. Здесь доступны только услуги и отделы отеля, активированные для вашего проживания. Чтобы связать услугу с вашим номером, пожалуйста, введите номер комнаты.`, button: "Понятно, продолжить" },',
    "    };",
    "",
    "    return strictCopy[lang] ?? strictCopy.bg;",
    "  }",
    "",
    "  const copy: Record<LangKey, { title: string; body: string; button: string }> = {",
  ].join("\n"),
  "Factory-safe intro copy",
);

guestHub = replaceOnce(
  guestHub,
  [
    "  const guestIntroCopy = useMemo(",
    "    () => getGuestIntroCopy(lang, config.hotelName),",
    "    [lang, config.hotelName]",
    "  );",
  ].join("\n"),
  [
    "  const guestIntroCopy = useMemo(",
    "    () => getGuestIntroCopy(lang, config.hotelName, guestRuntimeCapabilities.factoryManaged),",
    "    [guestRuntimeCapabilities.factoryManaged, lang, config.hotelName]",
    "  );",
  ].join("\n"),
  "Factory intro selection",
);

guestHub = replaceOnce(
  guestHub,
  [
    "  useEffect(() => {",
    "    const controller = new AbortController();",
    "    let refreshTimer: number | undefined;",
    "",
    "    const loadWeather = async () => {",
  ].join("\n"),
  [
    "  useEffect(() => {",
    "    if (!guestRuntimeCapabilities.weatherEnabled) {",
    "      setWeatherData(null);",
    "      setWeatherError(false);",
    "      setWeatherLoading(false);",
    "      return;",
    "    }",
    "",
    "    const controller = new AbortController();",
    "    let refreshTimer: number | undefined;",
    "",
    "    const loadWeather = async () => {",
  ].join("\n"),
  "Weather background authority gate",
);

guestHub = replaceOnce(
  guestHub,
  "  }, [config.hotelName, config.location?.query, hotelLatitude, hotelLongitude, hotelTimezone]);",
  "  }, [config.hotelName, config.location?.query, guestRuntimeCapabilities.weatherEnabled, hotelLatitude, hotelLongitude, hotelTimezone]);",
  "Weather authority dependency",
);

guestHub = replaceOnce(
  guestHub,
  [
    "  useEffect(() => {",
    "    if (!roomConfirmed || !room.trim() || !activeStayId || !stayDeviceId) return;",
    "",
    "    void refreshGuestMassageBookingsFromServer();",
    "    const timer = window.setInterval(() => {",
    "      void refreshGuestMassageBookingsFromServer();",
    "    }, 2 * 60_000);",
    "",
    "    return () => window.clearInterval(timer);",
    "  }, [activeStayId, refreshGuestMassageBookingsFromServer, room, roomConfirmed, stayDeviceId]);",
  ].join("\n"),
  [
    "  useEffect(() => {",
    "    if (!guestRuntimeCapabilities.massageBookingEnabled) return;",
    "    if (!roomConfirmed || !room.trim() || !activeStayId || !stayDeviceId) return;",
    "",
    "    void refreshGuestMassageBookingsFromServer();",
    "    const timer = window.setInterval(() => {",
    "      void refreshGuestMassageBookingsFromServer();",
    "    }, 2 * 60_000);",
    "",
    "    return () => window.clearInterval(timer);",
    "  }, [activeStayId, guestRuntimeCapabilities.massageBookingEnabled, refreshGuestMassageBookingsFromServer, room, roomConfirmed, stayDeviceId]);",
  ].join("\n"),
  "Massage background authority gate",
);

guestHub = replaceOnce(
  guestHub,
  [
    "      <div className=\"px-4 pb-7\">",
    "      <button",
    "        type=\"button\"",
    "        onClick={openAiPanel}",
  ].join("\n"),
  [
    "      {guestRuntimeCapabilities.aiEnabled ? (",
    "        <div className=\"px-4 pb-7\">",
    "        <button",
    "          type=\"button\"",
    "          onClick={openAiPanel}",
  ].join("\n"),
  "AI trigger authority opening gate",
);

guestHub = replaceOnce(
  guestHub,
  [
    "      </button>",
    "      </div>",
    "",
    "      {aiPanelOpen ? (",
  ].join("\n"),
  [
    "        </button>",
    "        </div>",
    "      ) : null}",
    "",
    "      {guestRuntimeCapabilities.aiEnabled && aiPanelOpen ? (",
  ].join("\n"),
  "AI trigger and panel authority closing gate",
);

fs.writeFileSync(guestHubPath, guestHub);

const testPath = "tests/contracts/shared-guest-runtime-genericization.contract.test.mjs";
let testSource = fs.readFileSync(testPath, "utf8");

testSource = replaceOnce(
  testSource,
  "  assert.equal(enabled.legacyRequestFallbacksEnabled, true);",
  [
    "  assert.equal(enabled.legacyRequestFallbacksEnabled, true);",
    "  assert.equal(enabled.aiEnabled, true);",
    "  assert.equal(enabled.weatherEnabled, true);",
  ].join("\n"),
  "Legacy capability compatibility assertions",
);

testSource = replaceOnce(
  testSource,
  [
    "  assert.equal(capabilities.factoryManaged, true);",
    "  assert.equal(capabilities.legacyRequestFallbacksEnabled, false);",
    "",
    "  const configured = resolveGuestRequestAuthority({",
  ].join("\n"),
  [
    "  assert.equal(capabilities.factoryManaged, true);",
    "  assert.equal(capabilities.legacyRequestFallbacksEnabled, false);",
    "  assert.equal(capabilities.aiEnabled, false);",
    "  assert.equal(capabilities.weatherEnabled, false);",
    "",
    "  const configured = resolveGuestRequestAuthority({",
  ].join("\n"),
  "Factory fail-closed capability assertions",
);

testSource = replaceOnce(
  testSource,
  [
    "  assert.equal(capabilities.factoryManaged, true);",
    "  assert.equal(capabilities.legacyRequestFallbacksEnabled, false);",
    "});",
    "",
    "test(\"Factory Guest navigation groups configured services by arbitrary target department\", async () => {",
  ].join("\n"),
  [
    "  assert.equal(capabilities.factoryManaged, true);",
    "  assert.equal(capabilities.legacyRequestFallbacksEnabled, false);",
    "  assert.equal(capabilities.aiEnabled, false);",
    "  assert.equal(capabilities.weatherEnabled, false);",
    "});",
    "",
    "test(\"Factory Guest capabilities require explicit AI/weather authority\", () => {",
    "  const capabilities = deriveGuestRuntimeCapabilities({",
    "    hotelSlug: \"factory-enabled\",",
    "    factoryBlueprint: { version: 1 },",
    "    factoryOnboardingEnvelope: {",
    "      schema_version: \"p2.4\",",
    "      ai_permissions: { actions: { READ: true } },",
    "    },",
    "    weatherEnabled: true,",
    "    requestDefs: [],",
    "  });",
    "",
    "  assert.equal(capabilities.factoryManaged, true);",
    "  assert.equal(capabilities.aiEnabled, true);",
    "  assert.equal(capabilities.weatherEnabled, true);",
    "});",
    "",
    "test(\"Factory Guest navigation groups configured services by arbitrary target department\", async () => {",
  ].join("\n"),
  "Serialized Factory and explicit capability assertions",
);

testSource = replaceOnce(
  testSource,
  [
    "  assertContains(guestHub, \"guestRuntimeCapabilities.legacyRequestFallbacksEnabled\");",
    "  assertContains(",
    "    guestHub,",
    "    'tile.special === \"massage\" && massageBookingPreviewVisible',",
    "  );",
  ].join("\n"),
  [
    "  assertContains(guestHub, \"guestRuntimeCapabilities.legacyRequestFallbacksEnabled\");",
    "  assertContains(guestHub, \"guestRuntimeCapabilities.weatherEnabled\");",
    "  assertContains(guestHub, \"if (!guestRuntimeCapabilities.massageBookingEnabled) return;\");",
    "  assertContains(guestHub, \"guestRuntimeCapabilities.aiEnabled ? (\");",
    "  assertContains(guestHub, \"guestRuntimeCapabilities.aiEnabled && aiPanelOpen\");",
    "  assertContains(guestHub, \"getGuestIntroCopy(lang, config.hotelName, guestRuntimeCapabilities.factoryManaged)\");",
    "  assertContains(",
    "    guestHub,",
    "    'tile.special === \"massage\" && massageBookingPreviewVisible',",
    "  );",
  ].join("\n"),
  "Strict Guest side-effect source contracts",
);

fs.writeFileSync(testPath, testSource);

console.log("Factory strict Guest side-effect transform applied successfully.");
