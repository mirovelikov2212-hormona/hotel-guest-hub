import Image from "next/image";

type Lang = "bg" | "en" | "de";

const COPY = {
  bg: {
    title: "Защо GOSTAYA",
    subtitle: "Повече оперативен капацитет от наличния екип.",
    text: "Хотелите ежедневно балансират между очакванията на гостите, натоварването на екипа и времето за изпълнение. GOSTAYA намалява ръчната координация и превръща повтарящите се взаимодействия в ясен, проследим работен поток.",
    cards: [
      ["По-голям оперативен капацитет", "Екипът поема повече работа с по-малко ръчна координация.", "⚙"],
      ["По-висока ефективност", "По-бърза реакция, по-ясни отговорности и по-малко пропуски.", "▥"],
      ["Оптимизирани процеси", "Директно насочване и проследимост от заявката до изпълнението.", "✦"],
      ["Подходящо при ограничен персонал", "Поддържайте последователно обслужване при променливо натоварване.", "◉"],
    ],
  },
  en: {
    title: "Why GOSTAYA",
    subtitle: "More operational capacity from the team you already have.",
    text: "Hotels constantly balance guest expectations, staff workload and execution time. GOSTAYA reduces manual coordination and turns repetitive interactions into a clear, traceable workflow.",
    cards: [
      ["More operational capacity", "Handle more work with less manual coordination.", "⚙"],
      ["Higher efficiency", "Faster response, clearer ownership and fewer missed tasks.", "▥"],
      ["Optimized processes", "Direct routing and traceability from request to completion.", "✦"],
      ["Built for lean teams", "Keep service consistent when staffing and workload change.", "◉"],
    ],
  },
  de: {
    title: "Warum GOSTAYA",
    subtitle: "Mehr operative Kapazität mit dem vorhandenen Team.",
    text: "Hotels balancieren täglich Gästeerwartungen, Teamauslastung und Ausführungszeit. GOSTAYA reduziert manuelle Koordination und macht wiederkehrende Interaktionen zu einem klaren, nachvollziehbaren Workflow.",
    cards: [
      ["Mehr operative Kapazität", "Mehr Arbeit mit weniger manueller Koordination.", "⚙"],
      ["Höhere Effizienz", "Schnellere Reaktion, klare Zuständigkeit und weniger Ausfälle.", "▥"],
      ["Optimierte Prozesse", "Direktes Routing und Nachverfolgbarkeit bis zur Erledigung.", "✦"],
      ["Für schlanke Teams", "Konstanter Service bei wechselnder Auslastung und Personalstärke.", "◉"],
    ],
  },
} as const;

export default function WhyGostaya({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <section id="why" className="mx-auto mt-5 max-w-7xl overflow-hidden rounded-[34px] border border-[#cfe8fb] bg-white shadow-[0_20px_60px_rgba(15,58,91,.07)]">
      <div className="grid lg:grid-cols-[1fr_300px]">
        <div className="px-5 py-10 sm:px-7 lg:py-11">
          <h2 className="text-3xl font-semibold leading-tight text-[#102a43] sm:text-4xl">{c.title}</h2>
          <p className="mt-2 text-lg font-semibold text-[#1479d3]">{c.subtitle}</p>
          <p className="gostaya-mobile-justify mt-3 max-w-4xl text-base leading-7 text-slate-600">{c.text}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {c.cards.map(([title, text, icon]) => (
              <article key={title} className="rounded-[24px] border border-[#d6e9f8] bg-[#fbfdff] p-5 shadow-[0_12px_30px_rgba(15,58,91,.05)]">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f4ff] text-xl font-black text-[#1479d3]">{icon}</div>
                <h3 className="mt-4 text-lg font-black leading-tight text-[#102a43]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="relative hidden min-h-[360px] overflow-hidden lg:block">
          <Image src="/images/aquamarine-test-hero-v6.jpg" alt="" fill className="object-cover" sizes="300px" />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/20 to-transparent" />
          <div className="absolute bottom-6 left-6 right-6 rounded-[22px] border border-white/60 bg-white/90 p-4 shadow-xl backdrop-blur">
            <div className="text-xs font-black uppercase tracking-[.16em] text-[#1479d3]">GOSTAYA</div>
            <div className="mt-1 text-sm font-bold text-[#102a43]">{lang === "bg" ? "Повече време за обслужване. По-малко време за координация." : lang === "de" ? "Mehr Zeit für Service. Weniger Zeit für Koordination." : "More time for service. Less time for coordination."}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
