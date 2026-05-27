const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'GuestHub.tsx');
if (!fs.existsSync(file)) {
  console.error('components/GuestHub.tsx not found. Run this script from the project root.');
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');

if (src.includes('STAYHUB_GUEST_INTRO_HELPERS') || src.includes('guestIntroStorageKey')) {
  console.log('Guest intro modal patch already appears to be applied. Nothing to do.');
  process.exit(0);
}

const backup = file + '.bak-guest-intro';
if (!fs.existsSync(backup)) fs.writeFileSync(backup, src, 'utf8');

const helper = `
// STAYHUB_GUEST_INTRO_HELPERS
const GUEST_INTRO_STORAGE_PREFIX = "stayhub_guest_intro_seen:";

function getGuestIntroCopy(lang: LangKey | string, hotelName?: string) {
  const safeHotelName = String(hotelName || "Hotel").trim() || "Hotel";
  const normalizedLang = String(lang || "en").trim().toLowerCase();

  const copy: Record<string, { title: string; body: string; button: string }> = {
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
// END_STAYHUB_GUEST_INTRO_HELPERS
`;

const helperAnchor = `function writeGuestLang(nextLang: LangKey) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(GUEST_LANGUAGE_STORAGE_KEY, nextLang);
  } catch (error) {
    console.error("writeGuestLang failed", error);
  }
}
`;

if (!src.includes(helperAnchor)) {
  console.error('Could not find writeGuestLang anchor. Patch not applied.');
  process.exit(1);
}

src = src.replace(helperAnchor, helperAnchor + helper);

const stateAnchor = `  const [roomStateHydrated, setRoomStateHydrated] = useState(false);
  const [pendingRoomChangeFrom, setPendingRoomChangeFrom] = useState<string | null>(null);
`;

const stateInsert = `  const [roomStateHydrated, setRoomStateHydrated] = useState(false);
  const [pendingRoomChangeFrom, setPendingRoomChangeFrom] = useState<string | null>(null);
  const [showGuestIntro, setShowGuestIntro] = useState(false);

  const guestIntroStorageKey = useMemo(() => {
    const hotelKey = String(roomStateKey || config.hotelSlug || "default").trim().toLowerCase() || "default";
    return GUEST_INTRO_STORAGE_PREFIX + hotelKey;
  }, [roomStateKey, config.hotelSlug]);
`;

if (!src.includes(stateAnchor)) {
  console.error('Could not find room state anchor. Patch not applied.');
  process.exit(1);
}

src = src.replace(stateAnchor, stateInsert);

const effectAnchor = `  useEffect(() => {
    if (!roomStateKey) return;

    const storedRoomState = readStoredGuestRoomState(roomStateKey);
`;

const effectInsert = `  useEffect(() => {
    if (!roomStateHydrated) return;

    if (roomConfirmed) {
      setShowGuestIntro(false);
      return;
    }

    try {
      const alreadySeen = window.localStorage.getItem(guestIntroStorageKey) === "yes";
      setShowGuestIntro(!alreadySeen);
    } catch (error) {
      console.error("read guest intro state failed", error);
      setShowGuestIntro(true);
    }
  }, [guestIntroStorageKey, roomConfirmed, roomStateHydrated]);

  const dismissGuestIntro = useCallback(() => {
    try {
      window.localStorage.setItem(guestIntroStorageKey, "yes");
    } catch (error) {
      console.error("write guest intro state failed", error);
    }

    setShowGuestIntro(false);
  }, [guestIntroStorageKey]);

` + effectAnchor;

if (!src.includes(effectAnchor)) {
  console.error('Could not find first room hydration useEffect anchor. Patch not applied.');
  process.exit(1);
}

src = src.replace(effectAnchor, effectInsert);

const returnAnchor = `  return (
    <div className="mx-auto max-w-md" style={themeStyle}>`;
const beforeReturn = `  const guestIntroCopy = useMemo(
    () => getGuestIntroCopy(lang, config.hotelName),
    [lang, config.hotelName]
  );

` + returnAnchor;

if (!src.includes(returnAnchor)) {
  console.error('Could not find main return anchor. Patch not applied.');
  process.exit(1);
}

src = src.replace(returnAnchor, beforeReturn);

const modalAnchor = `      {/* room switch banner removed - handled only by modal */}

      {!roomConfirmed ? (`;

const modalBlock = `      {showGuestIntro ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
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
                className="rounded-xl bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none ring-1 ring-neutral-700"
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

` + modalAnchor;

if (!src.includes(modalAnchor)) {
  console.error('Could not find room banner/modal insertion anchor. Patch not applied.');
  process.exit(1);
}

src = src.replace(modalAnchor, modalBlock);

fs.writeFileSync(file, src, 'utf8');
console.log('Guest intro modal patch applied successfully. Backup:', path.relative(process.cwd(), backup));
