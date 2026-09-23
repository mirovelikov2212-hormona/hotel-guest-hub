"use client";

import { useEffect, useMemo, useState } from "react";

import { useStaffUi } from "@/components/staff/StaffUiProvider";

type MoneyMap = Record<string, number>;

type RevenueSnapshot = {
  schemaVersion: "ancillary-revenue-v1";
  scope: "stayhub_ancillary_revenue";
  period: { from: string; to: string };
  generatedAt: string;
  definitions: Record<string, string>;
  moneyMinorByCurrency: {
    trackedRevenue: MoneyMap;
    grossRecognized: MoneyMap;
    reversals: MoneyMap;
    requestedValue: MoneyMap;
    pendingValue: MoneyMap;
    waivedValue: MoneyMap;
    cancelledValue: MoneyMap;
    aiAttributedRevenue: MoneyMap;
    guestHubDirectRevenue: MoneyMap;
    unattributedRevenue: MoneyMap;
  };
  requestFunnel: {
    requested: number;
    pending: number;
    charged: number;
    waived: number;
    cancelled: number;
    chargeRate: number | null;
  };
  revenueLedger: {
    recognitionEvents: number;
    reversalEvents: number;
    recognizedRequestCount: number;
    nativeEvents: number;
    reconstructedEvents: number;
    deltaMismatches: number;
    eventSequenceComplete: boolean;
  };
  attribution: {
    sourceCounts: {
      ai_assisted: number;
      guest_hub_direct: number;
      unattributed: number;
    };
    aiPaidActionsShown: number;
    aiPaidActionClicks: number;
    aiAttributedChargedRequests: number;
    aiClickThroughRate: number | null;
    aiClickToChargeRate: number | null;
    windowMinutes: number;
  };
  services: Array<{
    serviceKey: string;
    recognizedRevenue: MoneyMap;
    recognitionEvents: number;
    reversalEvents: number;
  }>;
  dataAuthority: {
    financial: string;
    currentPipeline: string;
    aiAttribution: string;
    roomRevenueMetrics: string;
  };
};

type RevenueResponse = {
  ok?: boolean;
  hotel?: {
    id: string;
    slug: string;
    publicSlug: string;
    name: string;
    timezone: string;
  };
  period?: { days: number; from: string; to: string };
  snapshot?: RevenueSnapshot;
  error?: string;
  detail?: string;
};

const COPY = {
  bg: {
    eyebrow: "Revenue & Upsell",
    title: "Ancillary Revenue",
    intro:
      "Приходи от платени услуги, които StayHub може да докаже чрез request → billing ledger. Това не е RMS и не включва приходите от стаи.",
    tracked: "Проследен нетен приход",
    gross: "Брутно начислено",
    reversals: "Reversals",
    pending: "Чака начисляване",
    aiRevenue: "AI-assisted revenue",
    requestFunnel: "Paid request funnel",
    requested: "Заявени",
    charged: "Начислени",
    waived: "Без начисляване",
    cancelled: "Отказани",
    chargeRate: "Request → charge rate",
    aiFunnel: "AI revenue funnel",
    shown: "Показани платени AI actions",
    clicked: "Кликнати платени AI actions",
    aiCharged: "AI-attributed charged requests",
    ctr: "Action CTR",
    clickToCharge: "Click → charge",
    byService: "Revenue по услуга",
    source: "Revenue attribution",
    direct: "Guest Hub direct",
    ai: "AI assisted",
    unattributed: "Без доказана attribution",
    quality: "Data quality",
    nativeLedger: "Native ledger events",
    reconstructed: "Reconstructed events",
    mismatch: "Delta mismatches",
    formulas: "Формули и източници",
    trackedFormula:
      "Tracked revenue = сумата от положителни charge deltas минус последващите reversals в избрания период.",
    pendingFormula:
      "Pending = текущата стойност на платени заявки, създадени през периода и все още чакащи billing решение.",
    aiFormula:
      "AI attribution = same-session AI action click → съвпадаща платена заявка до 30 минути.",
    roomMetrics: "ADR / RevPAR / Occupancy",
    roomMetricsUnavailable:
      "Не се изчисляват от StayHub-only данни. За тях е нужен PMS/RMS източник; не показваме 0 като заместител.",
    sourceFinancial: "Financial authority",
    sourcePipeline: "Pipeline authority",
    sourceAttribution: "Attribution authority",
    lastSync: "Последно изчисляване",
    period: "Период",
    loading: "Зареждане на Revenue данните…",
    unavailable: "Revenue отчетът не е наличен в момента.",
    datasetTooLarge:
      "Отчетът е спрян, защото dataset-ът надвишава безопасния лимит. Не е върнат частичен резултат.",
    noServiceRevenue: "Няма recognized revenue по услуги за този период.",
    days7: "7 дни",
    days30: "30 дни",
    days90: "90 дни",
    days365: "365 дни",
  },
  en: {
    eyebrow: "Revenue & Upsell",
    title: "Ancillary Revenue",
    intro:
      "Paid-service revenue that StayHub can prove through request → billing ledger. This is not an RMS and does not include room revenue.",
    tracked: "Tracked net revenue",
    gross: "Gross recognized",
    reversals: "Reversals",
    pending: "Pending charge",
    aiRevenue: "AI-assisted revenue",
    requestFunnel: "Paid request funnel",
    requested: "Requested",
    charged: "Charged",
    waived: "No charge",
    cancelled: "Cancelled",
    chargeRate: "Request → charge rate",
    aiFunnel: "AI revenue funnel",
    shown: "Paid AI actions shown",
    clicked: "Paid AI actions clicked",
    aiCharged: "AI-attributed charged requests",
    ctr: "Action CTR",
    clickToCharge: "Click → charge",
    byService: "Revenue by service",
    source: "Revenue attribution",
    direct: "Guest Hub direct",
    ai: "AI assisted",
    unattributed: "No verified attribution",
    quality: "Data quality",
    nativeLedger: "Native ledger events",
    reconstructed: "Reconstructed events",
    mismatch: "Delta mismatches",
    formulas: "Formulas and sources",
    trackedFormula:
      "Tracked revenue = positive charge deltas minus later reversals recognized inside the selected period.",
    pendingFormula:
      "Pending = current face value of paid requests created in the period that still await a billing decision.",
    aiFormula:
      "AI attribution = same-session AI action click → matching paid request within 30 minutes.",
    roomMetrics: "ADR / RevPAR / Occupancy",
    roomMetricsUnavailable:
      "Not computed from StayHub-only data. These require a PMS/RMS source; zero is not used as a substitute.",
    sourceFinancial: "Financial authority",
    sourcePipeline: "Pipeline authority",
    sourceAttribution: "Attribution authority",
    lastSync: "Last calculation",
    period: "Period",
    loading: "Loading Revenue data…",
    unavailable: "Revenue report is currently unavailable.",
    datasetTooLarge:
      "The report stopped because the dataset exceeded the safe limit. No partial result was returned.",
    noServiceRevenue: "No recognized service revenue in this period.",
    days7: "7 days",
    days30: "30 days",
    days90: "90 days",
    days365: "365 days",
  },
  de: {
    eyebrow: "Revenue & Upsell",
    title: "Ancillary Revenue",
    intro:
      "Umsatz aus kostenpflichtigen Leistungen, den StayHub über Request → Billing Ledger nachweisen kann. Dies ist kein RMS und enthält keinen Zimmerumsatz.",
    tracked: "Erfasster Nettoumsatz",
    gross: "Brutto gebucht",
    reversals: "Stornierungen",
    pending: "Offen zur Buchung",
    aiRevenue: "AI-assisted revenue",
    requestFunnel: "Paid request funnel",
    requested: "Angefragt",
    charged: "Gebucht",
    waived: "Ohne Buchung",
    cancelled: "Storniert",
    chargeRate: "Request → charge rate",
    aiFunnel: "AI revenue funnel",
    shown: "Gezeigte kostenpflichtige AI actions",
    clicked: "Geklickte kostenpflichtige AI actions",
    aiCharged: "AI-attributed charged requests",
    ctr: "Action CTR",
    clickToCharge: "Click → charge",
    byService: "Umsatz nach Leistung",
    source: "Revenue attribution",
    direct: "Guest Hub direct",
    ai: "AI assisted",
    unattributed: "Keine verifizierte Attribution",
    quality: "Datenqualität",
    nativeLedger: "Native ledger events",
    reconstructed: "Reconstructed events",
    mismatch: "Delta mismatches",
    formulas: "Formeln und Quellen",
    trackedFormula:
      "Tracked revenue = positive Charge-Deltas minus spätere Reversals im gewählten Zeitraum.",
    pendingFormula:
      "Pending = aktueller Wert kostenpflichtiger Anfragen aus dem Zeitraum, die noch auf eine Billing-Entscheidung warten.",
    aiFormula:
      "AI attribution = AI-action click derselben Session → passende kostenpflichtige Anfrage innerhalb von 30 Minuten.",
    roomMetrics: "ADR / RevPAR / Occupancy",
    roomMetricsUnavailable:
      "Nicht aus StayHub-only Daten berechnet. Dafür ist eine PMS/RMS-Quelle erforderlich; 0 wird nicht als Ersatz angezeigt.",
    sourceFinancial: "Financial authority",
    sourcePipeline: "Pipeline authority",
    sourceAttribution: "Attribution authority",
    lastSync: "Letzte Berechnung",
    period: "Zeitraum",
    loading: "Revenue-Daten werden geladen…",
    unavailable: "Der Revenue-Bericht ist derzeit nicht verfügbar.",
    datasetTooLarge:
      "Der Bericht wurde gestoppt, weil das Dataset das sichere Limit überschritten hat. Es wurde kein Teilergebnis geliefert.",
    noServiceRevenue: "Kein erkannter Service-Umsatz in diesem Zeitraum.",
    days7: "7 Tage",
    days30: "30 Tage",
    days90: "90 Tage",
    days365: "365 Tage",
  },
} as const;

function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatMoneyMap(map: MoneyMap, lang: string) {
  const entries = Object.entries(map || {});
  if (!entries.length) return "—";

  return entries
    .map(([currency, minor]) => {
      const amount = Number(minor || 0) / 100;
      try {
        return new Intl.NumberFormat(lang, {
          style: "currency",
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount);
      } catch {
        return `${amount.toFixed(2)} ${currency}`;
      }
    })
    .join(" · ");
}

function formatDateTime(value: string, lang: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(lang, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function serviceLabel(key: string) {
  return key.replace(/_/g, " ");
}

export default function RevenueDashboard({
  hotelSlug,
}: {
  hotelSlug: string;
}) {
  const { lang } = useStaffUi();
  const copy = COPY[lang] || COPY.en;
  const [days, setDays] = useState(30);
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          hotelSlug,
          days: String(days),
        });
        const response = await fetch(
          `/api/staff/revenue/summary?${params.toString()}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | RevenueResponse
          | null;
        if (!cancelled) {
          setData(body || { ok: false, error: "revenue_unavailable" });
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          console.error("Revenue dashboard load failed", error);
          setData({ ok: false, error: "revenue_unavailable" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [days, hotelSlug]);

  const snapshot = data?.snapshot;
  const periodText = useMemo(() => {
    if (!snapshot) return "—";
    const from = new Date(snapshot.period.from).toLocaleDateString(lang);
    const to = new Date(snapshot.period.to).toLocaleDateString(lang);
    return `${from} – ${to}`;
  }, [lang, snapshot]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
        {copy.loading}
      </div>
    );
  }

  if (!data?.ok || !snapshot) {
    return (
      <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 p-5 text-sm text-rose-100">
        {data?.error === "revenue_dataset_too_large"
          ? copy.datasetTooLarge
          : copy.unavailable}
      </div>
    );
  }

  const money = snapshot.moneyMinorByCurrency;
  const sourceRows = [
    [copy.ai, money.aiAttributedRevenue, snapshot.attribution.sourceCounts.ai_assisted],
    [copy.direct, money.guestHubDirectRevenue, snapshot.attribution.sourceCounts.guest_hub_direct],
    [copy.unattributed, money.unattributedRevenue, snapshot.attribution.sourceCounts.unattributed],
  ] as const;

  const revenueKpis: Array<{ label: string; value: MoneyMap }> = [
    { label: copy.tracked, value: money.trackedRevenue },
    { label: copy.gross, value: money.grossRecognized },
    { label: copy.reversals, value: money.reversals },
    { label: copy.pending, value: money.pendingValue },
    { label: copy.aiRevenue, value: money.aiAttributedRevenue },
  ];

  return (
    <main className="space-y-5 pb-safe">
      <section className="rounded-2xl border border-emerald-300/20 bg-emerald-400/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/70">
              StayHub · {copy.eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{copy.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              {copy.intro}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              [7, copy.days7],
              [30, copy.days30],
              [90, copy.days90],
              [365, copy.days365],
            ].map(([value, label]) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setDays(Number(value))}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  days === value
                    ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50"
                    : "border-white/10 bg-black/20 text-white/60 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/50">
          <span>{copy.period}: {periodText}</span>
          <span>·</span>
          <span>{copy.lastSync}: {formatDateTime(snapshot.generatedAt, lang)}</span>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {revenueKpis.map(({ label, value }) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-white/50">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {formatMoneyMap(value, lang)}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold text-white">{copy.requestFunnel}</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              [copy.requested, snapshot.requestFunnel.requested],
              [copy.charged, snapshot.requestFunnel.charged],
              [copy.pending, snapshot.requestFunnel.pending],
              [copy.waived, snapshot.requestFunnel.waived],
              [copy.cancelled, snapshot.requestFunnel.cancelled],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs text-white/45">{label}</p>
                <p className="mt-1 text-xl font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-white/60">
            {copy.chargeRate}: <strong className="text-white">{percent(snapshot.requestFunnel.chargeRate)}</strong>
          </p>
        </div>

        <div className="rounded-2xl border border-violet-300/20 bg-violet-400/5 p-5">
          <h3 className="text-lg font-semibold text-white">{copy.aiFunnel}</h3>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              [copy.shown, snapshot.attribution.aiPaidActionsShown],
              [copy.clicked, snapshot.attribution.aiPaidActionClicks],
              [copy.aiCharged, snapshot.attribution.aiAttributedChargedRequests],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs text-white/45">{label}</p>
                <p className="mt-1 text-xl font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-white/60">
            <span>{copy.ctr}: <strong className="text-white">{percent(snapshot.attribution.aiClickThroughRate)}</strong></span>
            <span>{copy.clickToCharge}: <strong className="text-white">{percent(snapshot.attribution.aiClickToChargeRate)}</strong></span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold text-white">{copy.source}</h3>
          <div className="mt-4 space-y-2">
            {sourceRows.map(([label, value, count]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <div>
                  <p className="text-sm font-medium text-white">{label}</p>
                  <p className="mt-1 text-xs text-white/45">{count} recognition events</p>
                </div>
                <p className="text-sm font-semibold text-emerald-100">
                  {formatMoneyMap(value, lang)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold text-white">{copy.byService}</h3>
          <div className="mt-4 space-y-2">
            {snapshot.services.length ? (
              snapshot.services.map((service) => (
                <div key={service.serviceKey} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div>
                    <p className="text-sm font-medium capitalize text-white">
                      {serviceLabel(service.serviceKey)}
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      +{service.recognitionEvents} · -{service.reversalEvents}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-emerald-100">
                    {formatMoneyMap(service.recognizedRevenue, lang)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-white/50">{copy.noServiceRevenue}</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold text-white">{copy.quality}</h3>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              [copy.nativeLedger, snapshot.revenueLedger.nativeEvents],
              [copy.reconstructed, snapshot.revenueLedger.reconstructedEvents],
              [copy.mismatch, snapshot.revenueLedger.deltaMismatches],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs text-white/45">{label}</p>
                <p className="mt-1 text-xl font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/5 p-5">
          <h3 className="text-lg font-semibold text-white">{copy.roomMetrics}</h3>
          <p className="mt-3 text-sm leading-6 text-white/60">
            {copy.roomMetricsUnavailable}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-lg font-semibold text-white">{copy.formulas}</h3>
        <div className="mt-4 space-y-3 text-sm leading-6 text-white/60">
          <p>{copy.trackedFormula}</p>
          <p>{copy.pendingFormula}</p>
          <p>{copy.aiFormula}</p>
          <div className="mt-4 grid gap-2 text-xs text-white/45 sm:grid-cols-3">
            <p>{copy.sourceFinancial}: <span className="text-white/70">{snapshot.dataAuthority.financial}</span></p>
            <p>{copy.sourcePipeline}: <span className="text-white/70">{snapshot.dataAuthority.currentPipeline}</span></p>
            <p>{copy.sourceAttribution}: <span className="text-white/70">{snapshot.dataAuthority.aiAttribution}</span></p>
          </div>
        </div>
      </section>
    </main>
  );
}
