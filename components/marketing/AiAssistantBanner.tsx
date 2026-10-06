import MarketingIcon, { MarketingFlag } from "./MarketingIcon";
import Image from "next/image";
import DemoLaunchLink from "./DemoLaunchLink";

type Lang = "bg" | "en" | "de";

const COPY = {
  bg: {
    eyebrow: "AI АСИСТЕНТ",
    title: "AI агент — обучен по вашите стандарти",
    text: "Отговаря на въпроси за хотела и услугите, използва само валидната за конкретния хотел информация и подпомага госта без да поема контрол върху оперативните правила.",
    points: ["Хотелски знания", "Поддръжка на 6 езика", "Достъп 24/7"],
  },
  en: {
    eyebrow: "AI ASSISTANT",
    title: "AI agent — trained to your standards",
    text: "Answers questions about the hotel and its services using only property-valid information, while operational rules remain controlled by the hotel.",
    points: ["Hotel knowledge", "6 languages", "24/7 access"],
  },
  de: {
    eyebrow: "AI-ASSISTENT",
    title: "AI-Agent — nach Ihren Standards trainiert",
    text: "Beantwortet Fragen zum Hotel und zu Services ausschließlich auf Basis gültiger Hotelinformationen; die operative Steuerung bleibt beim Hotel.",
    points: ["Hotelwissen", "6 Sprachen", "24/7 verfügbar"],
  },
} as const;

export default function AiAssistantBanner({lang}:{lang:Lang}) {
  const c=COPY[lang];return <section className="gostaya-shell gostaya-section gostaya-ai-banner">
    <div className="gostaya-ai-copy"><p className="gostaya-eyebrow">{c.eyebrow}</p><h2>{c.title}</h2><p>{c.text}</p><DemoLaunchLink className="gostaya-ai-action">{lang==="bg"?"Запознайте се с AI асистента":lang==="de"?"AI-Assistent kennenlernen":"Meet your AI assistant"}</DemoLaunchLink></div>
    <div className="gostaya-ai-capabilities">{c.points.map((point,i)=><div key={point}><span aria-hidden="true"><MarketingIcon name={["chat","globe","clock"][i]}/></span><strong>{point}</strong></div>)}
      <div className="gostaya-ai-languages">{[["bg","Български"],["en","English"],["de","Deutsch"],["ro","Română"],["cz","Čeština"],["ru","Русский"]].map(([flag,name])=><span key={name} title={name} aria-label={name}><MarketingFlag country={flag}/></span>)}</div>
    </div>
    <div className="gostaya-ai-visual"><span className="gostaya-ai-bubble">{lang==="bg"?"Как мога да помогна?":lang==="de"?"Wie kann ich helfen?":"How can I help?"}</span><Image src="/marketing/reference/gostaya-ai-concierge.webp" alt="" width={216} height={216}/></div>
  </section>;
}
