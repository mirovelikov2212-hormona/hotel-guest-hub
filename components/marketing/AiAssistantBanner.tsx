import MarketingIcon from "./MarketingIcon";
import AiConciergeExample from "./AiConciergeExample";
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
  const c=COPY[lang];
  return <section className="gostaya-shell gostaya-section gostaya-ai-banner">
    <div className="gostaya-ai-copy"><p className="gostaya-eyebrow">{c.eyebrow}</p><h2>{c.title}</h2><p>{c.text}</p>
      <div className="gostaya-ai-capabilities">{c.points.map((point,i)=><div key={point}><span aria-hidden="true"><MarketingIcon name={["chat","globe","clock"][i]}/></span><strong>{point}</strong></div>)}</div>
      <DemoLaunchLink className="gostaya-ai-action">{lang==="bg"?"Запознайте се с AI асистента":lang==="de"?"AI-Assistent kennenlernen":"Meet your AI assistant"}</DemoLaunchLink>
    </div><AiConciergeExample lang={lang}/>
  </section>;
}
