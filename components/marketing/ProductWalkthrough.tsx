"use client";

import { useMemo, useState } from "react";

type Lang = "bg" | "en" | "de";

type ProductView = {
  key: string;
  nav: string;
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
  accent: string;
};

const COPY: Record<Lang, { flowTitle: string; flowText: string; views: ProductView[]; live: string; safe: string }> = {
  bg: {
    flowTitle: "Виж продукта отвътре",
    flowText: "Превключи между реалните работни слоеве на GOSTAYA. Това е интерактивна продуктова визуализация; бутонът за live demo отваря истинския Guest Hub.",
    live: "Отвори live Guest Hub demo",
    safe: "Demo tenant · без реални хотелски заявки",
    views: [
      { key: "guest", nav: "Guest Hub", eyebrow: "ГОСТЪТ", title: "Един QR. Целият престой.", text: "Гостът отваря брандиран хотелски hub без app download, потвърждава стаята и получава информация, услуги, AI concierge и заявки на своя език.", points: ["Room confirmation", "Hotel info & venues", "AI concierge", "Direct service requests"], accent: "from-cyan-400/25 to-cyan-300/5" },
      { key: "staff", nav: "Staff", eyebrow: "ОПЕРАЦИИ", title: "Заявката отива при правилния екип.", text: "Housekeeping, Maintenance и Reception работят в отделни role-based екрани. Routing логиката следва реалното работно време и правилата на хотела.", points: ["Department routing", "After-hours fallback", "Status & alerts", "Tenant isolation"], accent: "from-emerald-400/25 to-emerald-300/5" },
      { key: "manager", nav: "Manager", eyebrow: "MANAGER INTELLIGENCE", title: "Един екран за реалната картина.", text: "Мениджърът вижда натоварване, заявки, service recovery, KPI, surveys и оперативни сигнали без да събира информация ръчно от отделите.", points: ["Operational overview", "Incident Center", "Survey signals", "AI-assisted analysis"], accent: "from-violet-400/25 to-violet-300/5" },
      { key: "training", nav: "Training", eyebrow: "STAFF DEVELOPMENT", title: "Стандарт → обучение → тест → доказан резултат.", text: "Хотелските и departmental стандарти се превръщат в обучения, тестове и verified results. HR rules и AI анализът подпомагат Manager-а, без автоматични HR решения.", points: ["Hotel & department standards", "Training plans", "Assessments", "Verified results + HR rules"], accent: "from-amber-400/25 to-amber-300/5" },
      { key: "revenue", nav: "Revenue", eyebrow: "VALUE & REVENUE", title: "От активност към измерима стойност.", text: "GOSTAYA свързва paid services, upsell, Reception Bypass, Direct Routing и AI Containment с проверими operational и revenue evidence.", points: ["Massage & paid services", "Revenue ledger", "ROI / value model", "Manager reporting"], accent: "from-rose-400/25 to-rose-300/5" },
      { key: "integrations", nav: "Integrations", eyebrow: "INTEGRATION LAYER", title: "Свързва се с хотелските системи, когато хотелът е готов.", text: "Provider-neutral integration layer за PMS и други системи. Например massage booking може да премине към folio charge след реално PMS потвърждение.", points: ["PMS-ready contracts", "Idempotent actions", "Human approval boundaries", "Audit & incident handling"], accent: "from-blue-400/25 to-blue-300/5" },
    ],
  },
  en: {
    flowTitle: "See the product from the inside",
    flowText: "Switch between the real operating layers of GOSTAYA. This is an interactive product walkthrough; the live demo button opens the actual Guest Hub.",
    live: "Open live Guest Hub demo",
    safe: "Demo tenant · no real hotel requests",
    views: [
      { key: "guest", nav: "Guest Hub", eyebrow: "THE GUEST", title: "One QR. The whole stay.", text: "Guests open a branded hotel hub without an app download, confirm their room, and access hotel information, services, AI concierge and requests in their language.", points: ["Room confirmation", "Hotel info & venues", "AI concierge", "Direct service requests"], accent: "from-cyan-400/25 to-cyan-300/5" },
      { key: "staff", nav: "Staff", eyebrow: "OPERATIONS", title: "Every request reaches the right team.", text: "Housekeeping, Maintenance and Reception work in separate role-based screens. Routing follows the hotel's real hours and operating rules.", points: ["Department routing", "After-hours fallback", "Status & alerts", "Tenant isolation"], accent: "from-emerald-400/25 to-emerald-300/5" },
      { key: "manager", nav: "Manager", eyebrow: "MANAGER INTELLIGENCE", title: "One view of what is actually happening.", text: "Managers see workload, requests, service recovery, KPI, surveys and operational signals without manually collecting updates from departments.", points: ["Operational overview", "Incident Center", "Survey signals", "AI-assisted analysis"], accent: "from-violet-400/25 to-violet-300/5" },
      { key: "training", nav: "Training", eyebrow: "STAFF DEVELOPMENT", title: "Standard → training → assessment → verified result.", text: "Hotel and department standards become training, assessments and verified results. HR rules and AI analysis support the Manager without making automated employment decisions.", points: ["Hotel & department standards", "Training plans", "Assessments", "Verified results + HR rules"], accent: "from-amber-400/25 to-amber-300/5" },
      { key: "revenue", nav: "Revenue", eyebrow: "VALUE & REVENUE", title: "Turn activity into measurable value.", text: "GOSTAYA connects paid services, upsell, Reception Bypass, Direct Routing and AI Containment to auditable operational and revenue evidence.", points: ["Massage & paid services", "Revenue ledger", "ROI / value model", "Manager reporting"], accent: "from-rose-400/25 to-rose-300/5" },
      { key: "integrations", nav: "Integrations", eyebrow: "INTEGRATION LAYER", title: "Connect the hotel stack when the hotel is ready.", text: "A provider-neutral integration layer for PMS and other systems. A massage booking, for example, can become a folio charge only after real PMS confirmation.", points: ["PMS-ready contracts", "Idempotent actions", "Human approval boundaries", "Audit & incident handling"], accent: "from-blue-400/25 to-blue-300/5" },
    ],
  },
  de: {
    flowTitle: "Das Produkt von innen sehen",
    flowText: "Wechsle zwischen den realen Arbeitsebenen von GOSTAYA. Diese interaktive Ansicht zeigt den Produktfluss; der Live-Demo-Button öffnet den echten Guest Hub.",
    live: "Live Guest Hub Demo öffnen",
    safe: "Demo-Tenant · keine echten Hotelanfragen",
    views: [
      { key: "guest", nav: "Guest Hub", eyebrow: "DER GAST", title: "Ein QR. Der gesamte Aufenthalt.", text: "Gäste öffnen einen gebrandeten Hotel-Hub ohne App-Download, bestätigen ihr Zimmer und nutzen Informationen, Services, AI Concierge und Anfragen in ihrer Sprache.", points: ["Zimmerbestätigung", "Hotelinfo & Outlets", "AI Concierge", "Direkte Serviceanfragen"], accent: "from-cyan-400/25 to-cyan-300/5" },
      { key: "staff", nav: "Staff", eyebrow: "OPERATIONS", title: "Jede Anfrage erreicht das richtige Team.", text: "Housekeeping, Technik und Rezeption arbeiten in getrennten rollenbasierten Ansichten. Das Routing folgt den realen Arbeitszeiten und Regeln des Hotels.", points: ["Department Routing", "After-hours Fallback", "Status & Alerts", "Tenant Isolation"], accent: "from-emerald-400/25 to-emerald-300/5" },
      { key: "manager", nav: "Manager", eyebrow: "MANAGER INTELLIGENCE", title: "Eine Ansicht der tatsächlichen Hoteloperation.", text: "Manager sehen Auslastung, Anfragen, Service Recovery, KPI, Surveys und operative Signale, ohne Status manuell aus den Abteilungen einzusammeln.", points: ["Operational Overview", "Incident Center", "Survey-Signale", "AI-gestützte Analyse"], accent: "from-violet-400/25 to-violet-300/5" },
      { key: "training", nav: "Training", eyebrow: "STAFF DEVELOPMENT", title: "Standard → Training → Test → verifiziertes Ergebnis.", text: "Hotel- und Abteilungsstandards werden zu Trainings, Assessments und verifizierten Ergebnissen. HR-Regeln und AI-Analyse unterstützen den Manager ohne automatische Personalentscheidungen.", points: ["Hotel- & Abteilungsstandards", "Trainingspläne", "Assessments", "Verified Results + HR Rules"], accent: "from-amber-400/25 to-amber-300/5" },
      { key: "revenue", nav: "Revenue", eyebrow: "VALUE & REVENUE", title: "Aktivität wird zu messbarem Wert.", text: "GOSTAYA verbindet Paid Services, Upsell, Reception Bypass, Direct Routing und AI Containment mit prüfbaren operativen und Revenue-Daten.", points: ["Massage & Paid Services", "Revenue Ledger", "ROI / Value Model", "Manager Reporting"], accent: "from-rose-400/25 to-rose-300/5" },
      { key: "integrations", nav: "Integrations", eyebrow: "INTEGRATION LAYER", title: "Integration mit dem Hotel-Stack, wenn das Hotel bereit ist.", text: "Provider-neutraler Integration Layer für PMS und weitere Systeme. Eine Massagebuchung kann z. B. erst nach echter PMS-Bestätigung als Folio Charge verbucht werden.", points: ["PMS-ready Contracts", "Idempotente Actions", "Human Approval Boundaries", "Audit & Incident Handling"], accent: "from-blue-400/25 to-blue-300/5" },
    ],
  },
};

function ScreenPreview({ view }: { view: ProductView }) {
  return (
    <div className={"relative overflow-hidden rounded-[28px] border border-white/10 bg-[#08131d] p-4 shadow-2xl sm:p-5"}>
      <div className={"absolute inset-0 bg-gradient-to-br " + view.accent} />
      <div className="relative">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">GOSTAYA</div>
            <div className="mt-1 text-sm font-semibold text-white">{view.nav}</div>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white/60">LIVE LOGIC</div>
        </div>
        <div className="mt-4 grid gap-2">
          {view.points.map((point, index) => (
            <div key={point} className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 p-3 backdrop-blur">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-xs font-semibold text-white">{String(index + 1).padStart(2, "0")}</div>
              <div className="min-w-0 flex-1">
                <div className="h-1.5 w-14 rounded-full bg-white/15" />
                <div className="mt-2 text-sm font-medium text-white">{point}</div>
              </div>
              <div className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,.7)]" />
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {["Guest", "Team", "Manager"].map((label, i) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
              <div className="text-[9px] uppercase tracking-widest text-white/35">{label}</div>
              <div className="mt-1 text-xs font-semibold text-white">{i === 0 ? "Intent" : i === 1 ? "Action" : "Evidence"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProductWalkthrough({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  const [activeKey, setActiveKey] = useState(copy.views[0].key);
  const active = useMemo(() => copy.views.find((view) => view.key === activeKey) || copy.views[0], [activeKey, copy.views]);

  return (
    <section id="product" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
      <div className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">PRODUCT EXPLORER</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">{copy.flowTitle}</h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">{copy.flowText}</p>
      </div>

      <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
        {copy.views.map((view) => (
          <button
            key={view.key}
            type="button"
            onClick={() => setActiveKey(view.key)}
            className={"shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition " + (active.key === view.key ? "border-cyan-300/60 bg-cyan-300 text-slate-950" : "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]")}
          >
            {view.nav}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.02fr_.98fr] lg:items-center">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.035] p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">{active.eyebrow}</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{active.title}</h3>
          <p className="mt-4 text-base leading-7 text-slate-300">{active.text}</p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {active.points.map((point) => (
              <div key={point} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm font-medium text-white/90">{point}</div>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href="/qr/demo?src=website&code=gostaya-product-explorer" target="_blank" rel="noreferrer" className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:-translate-y-0.5">{copy.live}</a>
            <span className="text-xs text-white/45">{copy.safe}</span>
          </div>
        </div>
        <ScreenPreview view={active} />
      </div>
    </section>
  );
}
