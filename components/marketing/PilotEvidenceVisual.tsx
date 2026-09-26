type Lang = "bg" | "en" | "de";

const DATA = [
  { key: "jun", opens: 1171, requests: 24, massages: 6 },
  { key: "jul", opens: 1803, requests: 41, massages: 18 },
  { key: "aug", opens: 1760, requests: 62, massages: 20 },
  { key: "sep", opens: 613, requests: 18, massages: 12 },
] as const;

const COPY = {
  bg: {
    title: "Активност през сезона",
    subtitle: "Само реално използване след QR достъп · без PMS интеграция през пилотния период · Europe/Sofia",
    opens: "Отваряния",
    requests: "Заявки",
    massages: "Масажи",
    requestShort: "заявки",
    massageShort: "масажи",
    months: { jun: "Юни", jul: "Юли", aug: "Авг.", sep: "Сеп." },
  },
  en: {
    title: "Season activity",
    subtitle: "Real non-test data · Europe/Sofia",
    opens: "Hub opens",
    requests: "Requests",
    massages: "Massages",
    requestShort: "req",
    massageShort: "spa",
    months: { jun: "Jun", jul: "Jul", aug: "Aug", sep: "Sep" },
  },
  de: {
    title: "Aktivität in der Saison",
    subtitle: "Reale Daten ohne Testeinträge · Europe/Sofia",
    opens: "Hub-Aufrufe",
    requests: "Anfragen",
    massages: "Massagen",
    requestShort: "Anfr.",
    massageShort: "Spa",
    months: { jun: "Jun", jul: "Jul", aug: "Aug", sep: "Sep" },
  },
} satisfies Record<
  Lang,
  {
    title: string;
    subtitle: string;
    opens: string;
    requests: string;
    massages: string;
    requestShort: string;
    massageShort: string;
    months: Record<(typeof DATA)[number]["key"], string>;
  }
>;

export default function PilotEvidenceVisual({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const max = Math.max(...DATA.map((row) => row.opens));

  return (
    <div className="rounded-[28px] border border-slate-200 bg-[#fbfdff] p-5 text-[#102a43] shadow-[0_14px_40px_rgba(15,58,91,.06)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-[#102a43]">{c.title}</div>
          <div className="mt-1 text-xs text-slate-500">{c.subtitle}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />{c.opens}</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />{c.requests}</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500" />{c.massages}</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {DATA.map((row) => {
          const height = Math.max(16, Math.round((row.opens / max) * 132));
          return (
            <div key={row.key} className="flex min-w-0 flex-col items-center">
              <div className="flex h-36 w-full items-end justify-center rounded-2xl border border-slate-200 bg-white px-2 pt-2">
                <div
                  className="relative w-full max-w-12 rounded-t-xl bg-gradient-to-t from-sky-300 to-sky-100 shadow-[0_0_18px_rgba(56,189,248,.18)]"
                  style={{ height }}
                  title={String(row.opens)}
                >
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-600">{row.opens}</span>
                </div>
              </div>
              <div className="mt-2 text-xs font-bold text-[#102a43]">{c.months[row.key]}</div>
              <div className="mt-2 flex flex-wrap justify-center gap-1 text-[9px]">
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{row.requests} {c.requestShort}</span>
                <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">{row.massages} {c.massageShort}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
