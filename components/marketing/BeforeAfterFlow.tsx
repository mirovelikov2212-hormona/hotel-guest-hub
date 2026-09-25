type Lang = "bg" | "en" | "de";

const COPY = {
  bg: {
    eyebrow: "ЕДНА ЗАЯВКА · ДВА ПРОЦЕСА",
    title: "Същият хотел. По-кратък път до свършената работа.",
    text: "Сравнението показва процеса, не маркетингово обещание. Времето по-долу е примерен operational model; реалният ROI се изчислява от наблюдаваните събития и допусканията на конкретния хотел.",
    before: "Преди GOSTAYA",
    after: "С GOSTAYA",
    beforeTime: "~8–15 мин. административно време",
    afterTime: "~2–5 мин. административно време",
    saved: "~6–10 мин. потенциално спестено време / заявка",
    beforeSteps: ["Гостът звъни на Reception", "Reception приема и записва", "Reception предава към Housekeeping", "Екипът изпълнява", "Гостът звъни отново при липса на обратна връзка"],
    afterSteps: ["Гостът изпраща заявка", "GOSTAYA я route-ва по хотелските правила", "Housekeeping вижда и поема задачата", "Статусът се проследява", "Manager получава operational evidence"],
    note: "Илюстративен модел — не stopwatch measurement. Реалните стойности се калибрират за хотела и се държат отделно от директно измерените събития.",
  },
  en: {
    eyebrow: "ONE REQUEST · TWO PROCESSES",
    title: "Same hotel. A shorter path to completed work.",
    text: "This comparison shows the process, not a marketing promise. The time below is an illustrative operational model; real ROI is calculated from observed events and property-specific assumptions.",
    before: "Before GOSTAYA",
    after: "With GOSTAYA",
    beforeTime: "~8–15 min admin time",
    afterTime: "~2–5 min admin time",
    saved: "~6–10 min potential time saved / request",
    beforeSteps: ["Guest calls Reception", "Reception receives and records", "Reception relays to Housekeeping", "Team completes the task", "Guest follows up if there is no feedback"],
    afterSteps: ["Guest sends the request", "GOSTAYA routes it by hotel rules", "Housekeeping sees and accepts it", "Status is tracked", "Manager receives operational evidence"],
    note: "Illustrative model — not stopwatch measurement. Real values are calibrated per property and kept separate from directly observed events.",
  },
  de: {
    eyebrow: "EINE ANFRAGE · ZWEI PROZESSE",
    title: "Dasselbe Hotel. Ein kürzerer Weg zur erledigten Aufgabe.",
    text: "Der Vergleich zeigt den Prozess, kein Marketingversprechen. Die Zeiten sind ein illustratives Betriebsmodell; der reale ROI basiert auf beobachteten Events und hotelspezifischen Annahmen.",
    before: "Vor GOSTAYA",
    after: "Mit GOSTAYA",
    beforeTime: "~8–15 Min. Admin-Zeit",
    afterTime: "~2–5 Min. Admin-Zeit",
    saved: "~6–10 Min. potenziell gesparte Zeit / Anfrage",
    beforeSteps: ["Gast ruft die Rezeption an", "Rezeption nimmt auf und notiert", "Rezeption leitet an Housekeeping weiter", "Team erledigt die Aufgabe", "Gast fragt bei fehlendem Feedback nach"],
    afterSteps: ["Gast sendet die Anfrage", "GOSTAYA routet nach Hotelregeln", "Housekeeping sieht und übernimmt", "Status wird verfolgt", "Manager erhält Operational Evidence"],
    note: "Illustratives Modell — keine Stoppuhrmessung. Reale Werte werden pro Hotel kalibriert und von direkt gemessenen Events getrennt.",
  },
} satisfies Record<Lang, { eyebrow: string; title: string; text: string; before: string; after: string; beforeTime: string; afterTime: string; saved: string; beforeSteps: string[]; afterSteps: string[]; note: string }>;

export default function BeforeAfterFlow({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <section className="border-y border-white/10 bg-white/[0.02]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">{c.eyebrow}</p>
        <h2 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight sm:text-5xl">{c.title}</h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">{c.text}</p>
        <div className="mt-9 grid gap-4 lg:grid-cols-2">
          {[[c.before, c.beforeTime, c.beforeSteps, "text-amber-200", "bg-amber-300/10 border-amber-200/15"], [c.after, c.afterTime, c.afterSteps, "text-emerald-200", "bg-emerald-300/10 border-emerald-200/15"]].map(([title, time, steps, accent, box]) => (
            <article key={title as string} className="rounded-[30px] border border-white/10 bg-[#091722] p-6">
              <div className="flex flex-wrap items-end justify-between gap-3"><h3 className="text-2xl font-semibold">{title as string}</h3><div className={`rounded-full border px-3 py-1.5 text-xs font-bold ${box as string} ${accent as string}`}>{time as string}</div></div>
              <div className="mt-6 space-y-2">{(steps as string[]).map((step, i) => <div key={step} className="grid grid-cols-[32px_1fr] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3"><span className={`grid h-8 w-8 place-items-center rounded-xl text-xs font-black ${box as string} ${accent as string}`}>{i + 1}</span><span className="text-sm font-semibold text-white/85">{step}</span></div>)}</div>
            </article>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-cyan-200/20 bg-cyan-200/[0.07] p-5"><div className="text-lg font-semibold text-cyan-50">{c.saved}</div><p className="mt-2 text-xs leading-5 text-white/45">{c.note}</p></div>
      </div>
    </section>
  );
}
