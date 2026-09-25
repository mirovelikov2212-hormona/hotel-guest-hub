type Lang = "bg" | "en" | "de";

const COPY = {
  bg: {
    eyebrow: "ИСТИНСКИ ПРОДУКТ · DEMO TENANT",
    title: "Тествай истинския GOSTAYA Guest Hub.",
    text: "Това не е кликаем mockup. Отваряш реалния demo tenant, въвеждаш публичния demo PIN и можеш да минеш през истинския guest → staff → manager flow.",
    pin: "Публичен demo PIN",
    room: "Demo стая",
    cta: "Отвори live Guest Hub",
    phone: "Работи директно в браузъра и може да се добави на телефона като PWA / app shortcut.",
    safe: "Изолирана demo среда · заявките са реални demo/test записи и не влизат в хотелски KPI.",
    journey: "Какво да тестваш",
    steps: [
      ["01", "Guest Hub", "Потвърди стая 901"],
      ["02", "Заявка", "Избери хотелски отдел и изпрати заявка"],
      ["03", "Staff Hub", "Старт → Готово за същата заявка"],
      ["04", "Manager", "Виж заявката и demo броячите"],
      ["05", "Лично съобщение", "Reception → стая 901"],
      ["06", "Broadcast", "Reception → всички активни гости"],
      ["07", "Анкета", "Покажи реалния survey flow"],
      ["08", "End of stay", "Приключи demo престоя"],
    ],
    staffLabel: "След заявката я виж тук",
    staffPin: "PIN 2026",
    housekeeping: "Housekeeping",
    maintenance: "Maintenance",
    reception: "Reception",
    manager: "Manager",
  },
  en: {
    eyebrow: "REAL PRODUCT · DEMO TENANT",
    title: "Test the real GOSTAYA Guest Hub.",
    text: "This is not a clickable mockup. Open the real demo tenant, enter the public demo PIN and follow the real guest → staff → manager flow.",
    pin: "Public demo PIN",
    room: "Demo room",
    cta: "Open live Guest Hub",
    phone: "Runs directly in the browser and can be added to the phone as a PWA / app shortcut.",
    safe: "Isolated demo environment · requests are real demo/test records and are excluded from hotel KPI.",
    journey: "What to test",
    steps: [
      ["01", "Guest Hub", "Confirm room 901"],
      ["02", "Request", "Choose a department and send a request"],
      ["03", "Staff Hub", "Start → Done on the same request"],
      ["04", "Manager", "See the request and demo counters"],
      ["05", "Personal message", "Reception → room 901"],
      ["06", "Broadcast", "Reception → all active guests"],
      ["07", "Survey", "Open the real survey flow"],
      ["08", "End of stay", "Complete the demo stay"],
    ],
    staffLabel: "After sending a request, see it here",
    staffPin: "PIN 2026",
    housekeeping: "Housekeeping",
    maintenance: "Maintenance",
    reception: "Reception",
    manager: "Manager",
  },
  de: {
    eyebrow: "ECHTES PRODUKT · DEMO TENANT",
    title: "Teste den echten GOSTAYA Guest Hub.",
    text: "Das ist kein klickbares Mockup. Öffne den echten Demo-Tenant, gib den öffentlichen Demo-PIN ein und durchlaufe den realen Guest → Staff → Manager Flow.",
    pin: "Öffentlicher Demo-PIN",
    room: "Demo-Zimmer",
    cta: "Live Guest Hub öffnen",
    phone: "Läuft direkt im Browser und kann als PWA / App-Shortcut zum Smartphone hinzugefügt werden.",
    safe: "Isolierte Demo-Umgebung · Anfragen sind echte Demo/Test-Einträge und werden nicht in Hotel-KPI gezählt.",
    journey: "Was du testen kannst",
    steps: [
      ["01", "Guest Hub", "Zimmer 901 bestätigen"],
      ["02", "Anfrage", "Abteilung wählen und Anfrage senden"],
      ["03", "Staff Hub", "Start → Fertig für dieselbe Anfrage"],
      ["04", "Manager", "Anfrage und Demo-Zähler sehen"],
      ["05", "Persönliche Nachricht", "Rezeption → Zimmer 901"],
      ["06", "Broadcast", "Rezeption → alle aktiven Gäste"],
      ["07", "Umfrage", "Echten Survey Flow öffnen"],
      ["08", "End of stay", "Demo-Aufenthalt beenden"],
    ],
    staffLabel: "Nach der Anfrage siehst du sie hier",
    staffPin: "PIN 2026",
    housekeeping: "Housekeeping",
    maintenance: "Technik",
    reception: "Rezeption",
    manager: "Manager",
  },
} satisfies Record<Lang, {
  eyebrow: string;
  title: string;
  text: string;
  pin: string;
  room: string;
  cta: string;
  phone: string;
  safe: string;
  journey: string;
  steps: string[][];
  staffLabel: string;
  staffPin: string;
  housekeeping: string;
  maintenance: string;
  reception: string;
  manager: string;
}>;

export default function DemoSpotlight({ lang }: { lang: Lang }) {
  const c = COPY[lang];

  return (
    <section id="demo" className="relative overflow-hidden border-y border-white/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_45%,rgba(34,211,238,.22),transparent_34%),radial-gradient(circle_at_80%_30%,rgba(167,139,250,.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,.025),transparent)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="rounded-[38px] border border-cyan-200/20 bg-gradient-to-br from-white/[0.09] via-white/[0.04] to-cyan-300/[0.06] p-6 shadow-[0_0_80px_rgba(34,211,238,.08)] backdrop-blur-xl sm:p-9">
          <div className="grid gap-6 lg:grid-cols-[1fr_.7fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">{c.eyebrow}</p>
              <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">{c.title}</h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200">{c.text}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="/h/demo"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl bg-cyan-200 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_30px_rgba(165,243,252,.16)] transition hover:-translate-y-0.5 hover:bg-white"
                >
                  {c.cta}
                </a>
                <div className="rounded-2xl border border-white/12 bg-black/20 px-4 py-3 text-sm text-white/75">
                  {c.phone}
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-white/45">{c.safe}</p>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 rounded-full bg-cyan-300/15 blur-3xl" />
              <div className="relative rounded-[30px] border border-white/15 bg-[#07121b]/85 p-5 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">GOSTAYA LIVE ACCESS</div>
                    <div className="mt-1 text-sm font-semibold text-white">Guest Hub demo</div>
                  </div>
                  <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-bold text-emerald-200">DEMO ONLY</div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-3xl border border-cyan-200/25 bg-cyan-200/[0.08] p-5">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-100/70">{c.pin}</div>
                    <div className="mt-2 text-4xl font-black tracking-[0.18em] text-white">2026</div>
                  </div>
                  <div className="rounded-3xl border border-violet-200/20 bg-violet-200/[0.07] p-5">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-violet-100/70">{c.room}</div>
                    <div className="mt-2 text-4xl font-black tracking-[0.12em] text-white">901</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ["01", "Open"],
                    ["02", "PIN 2026"],
                    ["03", "Room 901"],
                  ].map(([n, label]) => (
                    <div key={n} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                      <div className="text-[10px] font-black text-cyan-200">{n}</div>
                      <div className="mt-1 text-xs font-semibold text-white">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-white/10 pt-7">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-white/40">{c.journey}</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {c.steps.map(([number, title, detail]) => (
                <div key={number} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="text-[10px] font-black text-cyan-200">{number}</div>
                  <div className="mt-2 text-sm font-bold text-white">{title}</div>
                  <div className="mt-1 text-xs leading-5 text-white/50">{detail}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">{c.staffLabel}</div>
                <div className="mt-1 text-xs font-bold text-cyan-200">{c.staffPin}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href="/staff/demo/housekeeping" target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white">{c.housekeeping}</a>
                <a href="/staff/demo/maintenance" target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white">{c.maintenance}</a>
                <a href="/staff/demo/reception" target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white">{c.reception}</a>
                <a href="/staff/demo/manager" target="_blank" rel="noreferrer" className="rounded-xl border border-violet-200/20 bg-violet-200/[0.08] px-3 py-2 text-xs font-semibold text-violet-100">{c.manager}</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
