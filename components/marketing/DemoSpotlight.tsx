import DemoLaunchLink from "./DemoLaunchLink";

type Lang = "bg" | "en" | "de";

const COPY = {
  bg: {
    title: "Сканирай като гост.\nВиж хотела отвътре.",
    text: "Изпрати реална тестова заявка от телефона си и отвори мениджърския панел, за да проследиш същото действие от оперативната страна.",
    cta: "Стартирай интерактивното демо",
    managerCta: "Само мениджърския панел",
  },
  en: {
    title: "Scan as a guest. Then see the hotel from the inside.",
    text: "Send a real demo request from your phone and open Manager to see the same action from the operational side.",
    cta: "Start interactive demo",
    managerCta: "Manager only",
  },
  de: {
    title: "Scanne als Gast. Sieh danach das Hotel von innen.",
    text: "Sende eine echte Demo-Anfrage vom Smartphone und öffne danach Manager, um dieselbe Aktion operativ zu sehen.",
    cta: "Interaktive Demo starten",
    managerCta: "Nur Manager",
  },
} as const;

export default function DemoSpotlight({ lang }: { lang: Lang }) {
  const c = COPY[lang];

  return (
    <section
      id="demo"
      className="relative mx-auto mt-5 max-w-7xl overflow-hidden rounded-[38px] border border-slate-200 bg-[#f5faff] shadow-[0_24px_70px_rgba(15,58,91,.08)]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_35%,rgba(44,157,255,.14),transparent_34%),radial-gradient(circle_at_82%_30%,rgba(44,157,255,.08),transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="rounded-[34px] border border-slate-200 bg-white/95 p-6 text-[#102a43] shadow-[0_20px_60px_rgba(15,58,91,.09)] sm:p-8">
          <h2 className="max-w-2xl whitespace-pre-line text-balance text-3xl font-semibold leading-tight tracking-tight text-[#102a43] sm:text-4xl">
            {c.title}
          </h2>
          <p className="gostaya-mobile-justify mt-3 max-w-xl text-pretty text-base leading-7 text-slate-600">
            {c.text}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <DemoLaunchLink className="gostaya-primary-action flex w-full justify-center rounded-2xl bg-[#1479d3] px-5 py-3 text-center text-sm font-black text-white shadow-lg shadow-sky-200 transition hover:-translate-y-0.5 sm:w-auto">
              {c.cta}
            </DemoLaunchLink>
            <a
              href="/staff/demo/manager"
              className="gostaya-secondary-action flex w-full justify-center rounded-2xl border border-sky-200 bg-white px-5 py-3 text-center text-sm font-bold text-white sm:w-auto"
            >
              <span className="sm:hidden">Стартирай мениджърския панел</span>
              <span className="hidden sm:inline">{c.managerCta}</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
