import { GostayaVortex } from "./GostayaMotion";
import MarketingIcon from "./MarketingIcon";
import AiConciergeExample from "./AiConciergeExample";

type Lang = "bg" | "en" | "de";

const COPY = {
  bg: {
    eyebrow: "AI АСИСТЕНТ",
    title: "AI агент — обучен по вашите стандарти",
    text: "Отговаря на въпроси за хотела и услугите, използва само валидната за конкретния хотел информация и предлага бутон към точната секция, заявка или резервация. Показването, кликът и последващото действие се проследяват, за да измервате приноса на ИИ агента.",
    points: ["Информация само за хотела", "Езици според вашите гости", "Достъп 24/7"],
  },
  en: {
    eyebrow: "AI ASSISTANT",
    title: "AI agent — trained to your standards",
    text: "Answers questions about the hotel and its services using only property-valid information, and offers a direct button to the relevant section, request or booking. Impressions, clicks and subsequent actions are linked to measure the AI agent’s contribution.",
    points: ["Information only about the hotel", "Languages for your guests", "24/7 access"],
  },
  de: {
    eyebrow: "AI-ASSISTENT",
    title: "AI-Agent — nach Ihren Standards trainiert",
    text: "Beantwortet Fragen zum Hotel und zu Services ausschließlich auf Basis gültiger Hotelinformationen; bietet direkte Schaltflächen zum passenden Bereich, zur Anfrage oder Buchung. Anzeigen, Klicks und folgende Aktionen werden verknüpft, um den Beitrag des KI-Agenten zu messen.",
    points: ["Nur Informationen zum Hotel", "Sprachen für Ihre Gäste", "24/7 verfügbar"],
  },
} as const;

export default function AiAssistantBanner({lang}:{lang:Lang}) {
  const c=COPY[lang];
  return <section className="gostaya-shell gostaya-section gostaya-ai-banner">
    <div className="gostaya-ai-copy"><p className="gostaya-eyebrow">{c.eyebrow}</p><h2>{c.title}</h2><p>{c.text}</p>
      <div className="gostaya-ai-capabilities">{c.points.map((point,i)=><div key={point}><span aria-hidden="true"><MarketingIcon name={["chat","globe","clock"][i]}/></span><strong>{point}</strong></div>)}</div>
    <GostayaVortex lang={lang}/></div><AiConciergeExample lang={lang}/>
  </section>;
}
