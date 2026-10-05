import Image from "next/image";

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

export default function AiAssistantBanner({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <section className="mx-auto mt-5 max-w-7xl overflow-hidden rounded-[34px] border border-[#164e82] bg-gradient-to-r from-[#071c34] via-[#0a3158] to-[#0c5da0] text-white shadow-[0_22px_60px_rgba(4,31,56,.22)]">
      <div className="grid gap-6 px-5 py-9 sm:px-7 lg:grid-cols-[1.25fr_.75fr] lg:items-center lg:py-10">
        <div>
          <p className="text-xs font-black uppercase tracking-[.22em] text-sky-300">{c.eyebrow}</p>
          <h2 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight sm:text-4xl">{c.title}</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-sky-50/85">{c.text}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {c.points.map((point)=><span key={point} className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-black text-white backdrop-blur">{point}</span>)}
          </div>
        </div>
        <div className="relative mx-auto grid h-44 w-full max-w-[320px] place-items-center overflow-hidden rounded-[28px] border border-white/15 bg-white/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(88,190,255,.30),transparent_45%)]" />
          <Image src="/icons/guesthub-premium/ai-concierge.png" alt="" width={132} height={132} className="relative drop-shadow-[0_16px_28px_rgba(0,0,0,.25)]" />
        </div>
      </div>
    </section>
  );
}
