import MarketingIcon from "./MarketingIcon";
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
  return <section id="why" className="gostaya-shell gostaya-section gostaya-why">
    <div className="gostaya-why-copy">
      <p className="gostaya-eyebrow">{lang === "bg" ? "ПОВЕЧЕ ВРЕМЕ ЗА ГОСТИТЕ" : lang === "de" ? "MEHR ZEIT FÜR GÄSTE" : "MORE TIME FOR GUESTS"}</p>
      <h2>{c.title.split("GOSTAYA")[0]}<span className="gostaya-mobile-brand">GOSTAYA</span></h2>
      <p className="gostaya-lead">{c.subtitle}</p>
      <p className="gostaya-body">{c.text}</p>
      <div className="gostaya-benefits">{c.cards.map(([title,text],i)=><article key={title}>
        <span className="gostaya-emoji" aria-hidden="true"><MarketingIcon name={["settings","chart","sparkle","team"][i]}/></span>
        <h3>{title}</h3><p>{text}</p>
      </article>)}</div>
    </div>
    <div className="gostaya-manager-photo"><Image src="/marketing/reference/gostaya-manager-hq.webp" alt="" fill sizes="(min-width: 1024px) 360px, (min-width: 768px) 30vw, 100vw" className="object-cover"/>
      <div className="gostaya-photo-caption">{lang === "bg" ? "Технологията координира. Екипът се грижи." : lang === "de" ? "Technologie koordiniert. Ihr Team kümmert sich." : "Technology coordinates. Your team cares."}</div>
    </div>
  </section>;
}
