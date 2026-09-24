type Lang = "bg" | "en" | "de";

const DATA = [
  { month: "Jun", opens: 1171, requests: 24, massages: 6 },
  { month: "Jul", opens: 1803, requests: 41, massages: 18 },
  { month: "Aug", opens: 1760, requests: 62, massages: 20 },
  { month: "Sep", opens: 613, requests: 18, massages: 12 },
];

const COPY = {
  bg: { title: "Активност през сезона", subtitle: "Реални non-test данни · Europe/Sofia", opens: "Hub opens", requests: "Requests", massages: "Massages" },
  en: { title: "Season activity", subtitle: "Real non-test data · Europe/Sofia", opens: "Hub opens", requests: "Requests", massages: "Massages" },
  de: { title: "Aktivität in der Saison", subtitle: "Reale Non-test-Daten · Europe/Sofia", opens: "Hub opens", requests: "Requests", massages: "Massages" },
} satisfies Record<Lang, { title: string; subtitle: string; opens: string; requests: string; massages: string }>;

export default function PilotEvidenceVisual({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const max = Math.max(...DATA.map((row) => row.opens));

  return (
    <div className="rounded-[30px] border border-white/10 bg-gradient-to-br from-white/[0.075] to-white/[0.025] p-5 shadow-[0_0_60px_rgba(52,211,153,.05)] sm:p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white">{c.title}</div>
          <div className="mt-1 text-xs text-white/35">{c.subtitle}</div>
        </div>
        <div className="hidden items-center gap-3 text-[10px] text-white/45 sm:flex">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-cyan-200" />{c.opens}</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-300" />{c.requests}</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-300" />{c.massages}</span>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-4 gap-3">
        {DATA.map((row) => {
          const height = Math.max(16, Math.round((row.opens / max) * 132));
          return (
            <div key={row.month} className="flex min-w-0 flex-col items-center">
              <div className="flex h-36 w-full items-end justify-center rounded-2xl border border-white/8 bg-black/10 px-2 pt-2">
                <div
                  className="relative w-full max-w-12 rounded-t-xl bg-gradient-to-t from-cyan-300/40 to-cyan-100 shadow-[0_0_22px_rgba(165,243,252,.10)]"
                  style={{ height }}
                  title={String(row.opens)}
                >
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white/70">{row.opens}</span>
                </div>
              </div>
              <div className="mt-2 text-xs font-bold text-white/70">{row.month}</div>
              <div className="mt-2 flex flex-wrap justify-center gap-1 text-[9px]">
                <span className="rounded-full bg-emerald-300/10 px-2 py-1 text-emerald-200">{row.requests} req</span>
                <span className="rounded-full bg-violet-300/10 px-2 py-1 text-violet-200">{row.massages} spa</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
