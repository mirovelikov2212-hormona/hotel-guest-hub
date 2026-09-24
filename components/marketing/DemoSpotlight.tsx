type Lang = "bg" | "en" | "de";

const COPY = {
  bg: {
    eyebrow: "ИСТИНСКИ ПРОДУКТ · DEMO TENANT",
    title: "Тествай истинския GOSTAYA Guest Hub.",
    text: "Това не е кликаем mockup. Отваряш реалния demo tenant, въвеждаш публичния demo PIN и можеш да разгледаш истинския guest flow.",
    pin: "Публичен demo PIN",
    cta: "Отвори live Guest Hub",
    phone: "Работи директно в браузъра и може да се добави на телефона като PWA / app shortcut.",
    safe: "Изолирана demo среда · не изпраща заявки към реален хотел.",
  },
  en: {
    eyebrow: "REAL PRODUCT · DEMO TENANT",
    title: "Test the real GOSTAYA Guest Hub.",
    text: "This is not a clickable mockup. Open the real demo tenant, enter the public demo PIN and explore the actual guest flow.",
    pin: "Public demo PIN",
    cta: "Open live Guest Hub",
    phone: "Runs directly in the browser and can be added to the phone as a PWA / app shortcut.",
    safe: "Isolated demo environment · no requests are sent to a real hotel.",
  },
  de: {
    eyebrow: "ECHTES PRODUKT · DEMO TENANT",
    title: "Teste den echten GOSTAYA Guest Hub.",
    text: "Das ist kein klickbares Mockup. Öffne den echten Demo-Tenant, gib den öffentlichen Demo-PIN ein und teste den realen Guest Flow.",
    pin: "Öffentlicher Demo-PIN",
    cta: "Live Guest Hub öffnen",
    phone: "Läuft direkt im Browser und kann als PWA / App-Shortcut zum Smartphone hinzugefügt werden.",
    safe: "Isolierte Demo-Umgebung · keine Anfragen an ein echtes Hotel.",
  },
} satisfies Record<Lang, {
  eyebrow: string;
  title: string;
  text: string;
  pin: string;
  cta: string;
  phone: string;
  safe: string;
}>;

export default function DemoSpotlight({ lang }: { lang: Lang }) {
  const c = COPY[lang];

  return (
    <section id="demo" className="relative overflow-hidden border-y border-white/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_45%,rgba(34,211,238,.22),transparent_34%),radial-gradient(circle_at_80%_30%,rgba(167,139,250,.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,.025),transparent)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="grid gap-6 rounded-[38px] border border-cyan-200/20 bg-gradient-to-br from-white/[0.09] via-white/[0.04] to-cyan-300/[0.06] p-6 shadow-[0_0_80px_rgba(34,211,238,.08)] backdrop-blur-xl sm:p-9 lg:grid-cols-[1fr_.7fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">{c.eyebrow}</p>
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">{c.title}</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200">{c.text}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="/qr/demo?src=website&code=gostaya-live-demo"
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
              <div className="mt-5 rounded-3xl border border-cyan-200/25 bg-cyan-200/[0.08] p-5">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-100/70">{c.pin}</div>
                <div className="mt-2 text-5xl font-black tracking-[0.22em] text-white">2026</div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  ["01", "Open"],
                  ["02", "PIN 2026"],
                  ["03", "Explore"],
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
      </div>
    </section>
  );
}
