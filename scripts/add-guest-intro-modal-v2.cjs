const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'GuestHub.tsx');
if (!fs.existsSync(file)) {
  console.error('components/GuestHub.tsx not found. Run this script from the project root.');
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');
const backup = file + '.bak-guest-intro-v2';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, src, 'utf8');

function fail(message) {
  console.error(message);
  console.error('No changes were written. Backup remains:', path.relative(process.cwd(), backup));
  process.exit(1);
}

// 1) Helper copy
if (!src.includes('STAYHUB_GUEST_INTRO_V2')) {
  const helper = `
// STAYHUB_GUEST_INTRO_V2
const GUEST_INTRO_STORAGE_PREFIX = "stayhub_guest_intro_seen:";

type GuestIntroCopy = {
  title: string;
  body: string;
  button: string;
};

function getGuestIntroCopy(lang: LangKey | string, hotelName?: string): GuestIntroCopy {
  const safeHotelName = String(hotelName || "Hotel").trim() || "Hotel";
  const normalizedLang = String(lang || "en").trim().toLowerCase();

  const copy: Record<string, GuestIntroCopy> = {
    bg: {
      title: "Добре дошли в дигиталния консиерж на " + safeHotelName,
      body:
        "Тук можете бързо да намерите информация за хотела, ресторанта, баровете, анимацията, Wi-Fi, времето и полезни места около хотела.\n\nМожете също да изпращате заявки към рецепция, housekeeping и техническа поддръжка директно от телефона си. За да свържем услугата с Вашата стая, моля въведете номера на стаята си.",
      button: "Разбрах, продължи",
    },
    en: {
      title: "Welcome to the digital concierge of " + safeHotelName,
      body:
        "Here you can quickly find hotel information, restaurant and bar details, animation, Wi-Fi, weather, and useful places nearby.\n\nYou can also send requests to reception, housekeeping, and maintenance directly from your phone. To connect the service with your room, please enter your room number.",
      button: "Got it, continue",
    },
    de: {
      title: "Willkommen beim digitalen Concierge des " + safeHotelName,
      body:
        "Hier finden Sie schnell Informationen zum Hotel, Restaurant, zu Bars, Animation, WLAN, Wetter und hilfreichen Orten in der Umgebung.\n\nAußerdem können Sie Anfragen direkt vom Telefon an Rezeption, Housekeeping und Technik senden. Damit wir den Service Ihrem Zimmer zuordnen können, geben Sie bitte Ihre Zimmernummer ein.",
      button: "Verstanden, weiter",
    },
    ro: {
      title: "Bine ați venit la concierge-ul digital al " + safeHotelName,
      body:
        "Aici găsiți rapid informații despre hotel, restaurant, baruri, animație, Wi-Fi, vreme și locuri utile din apropiere.\n\nDe asemenea, puteți trimite solicitări către recepție, housekeeping și întreținere direct de pe telefon. Pentru a conecta serviciul cu camera dvs., vă rugăm să introduceți numărul camerei.",
      button: "Am înțeles, continuă",
    },
    cs: {
      title: "Vítejte v digitálním concierge hotelu " + safeHotelName,
      body:
        "Zde rychle najdete informace o hotelu, restauraci, barech, animaci, Wi-Fi, počasí a užitečných místech v okolí.\n\nMůžete také posílat požadavky na recepci, housekeeping a údržbu přímo z telefonu. Abychom službu přiřadili k vašemu pokoji, zadejte prosím číslo pokoje.",
      button: "Rozumím, pokračovat",
    },
  };

  return copy[normalizedLang] || copy.en;
}
// END_STAYHUB_GUEST_INTRO_V2
`;

  const writeGuestLangRegex = /function writeGuestLang\(nextLang: LangKey\) \{[\s\S]*?\n\}\n/;
  const match = src.match(writeGuestLangRegex);
  if (!match) fail('Could not find writeGuestLang function.');
  src = src.replace(writeGuestLangRegex, match[0] + helper);
}

// 2) State and storage key
if (!src.includes('const [showGuestIntro, setShowGuestIntro]')) {
  const stateRegex = /(  const \[roomStateHydrated, setRoomStateHydrated\] = useState\(false\);\n  const \[pendingRoomChangeFrom, setPendingRoomChangeFrom\] = useState<string \| null>\(null\);\n)/;
  if (!stateRegex.test(src)) fail('Could not find room state block.');
  src = src.replace(
    stateRegex,
    `$1  const [showGuestIntro, setShowGuestIntro] = useState(false);\n\n  const guestIntroStorageKey = useMemo(() => {\n    const hotelKey = String(roomStateKey || config.hotelSlug || "default").trim().toLowerCase() || "default";\n    return GUEST_INTRO_STORAGE_PREFIX + hotelKey;\n  }, [roomStateKey, config.hotelSlug]);\n\n  const forceGuestIntro = useMemo(() => {\n    if (typeof window === "undefined") return false;\n    return new URLSearchParams(window.location.search).get("intro") === "1";\n  }, []);\n`
  );
}

// 3) Effect and dismiss action. Insert before room hydration effect.
if (!src.includes('function dismissGuestIntro') && !src.includes('const dismissGuestIntro = useCallback')) {
  const effectAnchor = '  useEffect(() => {\n    if (!roomStateKey) return;\n\n    const storedRoomState = readStoredGuestRoomState(roomStateKey);\n';
  if (!src.includes(effectAnchor)) fail('Could not find room hydration effect anchor.');

  const effectBlock = `  useEffect(() => {
    if (!roomStateHydrated) return;

    if (forceGuestIntro) {
      setShowGuestIntro(true);
      return;
    }

    try {
      const alreadySeen = window.localStorage.getItem(guestIntroStorageKey) === "yes";
      setShowGuestIntro(!alreadySeen);
    } catch (error) {
      console.error("read guest intro state failed", error);
      setShowGuestIntro(true);
    }
  }, [forceGuestIntro, guestIntroStorageKey, roomStateHydrated]);

  const dismissGuestIntro = useCallback(() => {
    try {
      window.localStorage.setItem(guestIntroStorageKey, "yes");
    } catch (error) {
      console.error("write guest intro state failed", error);
    }

    setShowGuestIntro(false);
  }, [guestIntroStorageKey]);

`;
  src = src.replace(effectAnchor, effectBlock + effectAnchor);
}

// 4) Copy useMemo before main return
if (!src.includes('const guestIntroCopy = useMemo(')) {
  const returnAnchor = '  return (\n    <div className="mx-auto max-w-md" style={themeStyle}>';
  if (!src.includes(returnAnchor)) fail('Could not find main return anchor.');
  src = src.replace(
    returnAnchor,
    `  const guestIntroCopy = useMemo(\n    () => getGuestIntroCopy(lang, config.hotelName),\n    [lang, config.hotelName]\n  );\n\n${returnAnchor}`
  );
}

// 5) Modal UI right after root div opens.
if (!src.includes('STAYHUB_GUEST_INTRO_MODAL_V2')) {
  const rootAnchor = '  return (\n    <div className="mx-auto max-w-md" style={themeStyle}>\n';
  if (!src.includes(rootAnchor)) fail('Could not find root div anchor.');

  const modal = `  return (
    <div className="mx-auto max-w-md" style={themeStyle}>
      {/* STAYHUB_GUEST_INTRO_MODAL_V2 */}
      {showGuestIntro ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-400">
                  StayHub
                </div>
                <h2 className="mt-2 text-xl font-semibold leading-tight text-white">
                  {guestIntroCopy.title}
                </h2>
              </div>

              <select
                value={String(lang)}
                onChange={(e) => setLang(e.target.value as LangKey)}
                className="shrink-0 rounded-xl bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none ring-1 ring-neutral-700"
                aria-label="Language"
              >
                {config.languages.map((l) => (
                  <option key={String(l)} value={String(l)}>
                    {String(l).toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <p className="whitespace-pre-line text-sm leading-6 text-neutral-200">
              {guestIntroCopy.body}
            </p>

            <button
              type="button"
              onClick={dismissGuestIntro}
              className="mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-95 active:scale-[0.99]"
              style={{ backgroundColor: "var(--stayhub-primary)", color: "var(--stayhub-on-primary)" }}
            >
              {guestIntroCopy.button}
            </button>
          </div>
        </div>
      ) : null}
`;
  src = src.replace(rootAnchor, modal);
}

fs.writeFileSync(file, src, 'utf8');
console.log('Guest intro modal v2 patch applied successfully. Backup:', path.relative(process.cwd(), backup));
console.log('Tip: open the hub with ?intro=1 to force-show the intro for testing.');
