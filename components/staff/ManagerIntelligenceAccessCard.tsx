"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStaffUi } from "@/components/staff/StaffUiProvider";

const COPY = {
  bg: {
    eyebrow: "ДОПЪЛНИТЕЛЕН ПЛАТЕН МОДУЛ",
    title: "Мениджърски анализ",
    body: "Следи активните модули на хотела, извежда важните сигнали през деня и подготвя пълен сутрешен отчет за предходния хотелски ден.",
    open: "Отвори мениджърския анализ",
    locked: "Модулът не е активиран за този хотел.",
    checking: "Проверка на модула…",
  },
  en: {
    eyebrow: "PAID ADD-ON",
    title: "Manager Intelligence",
    body: "Monitors enabled hotel modules, surfaces important signals during the day and prepares a full morning brief for the previous hotel day.",
    open: "Open Manager Intelligence",
    locked: "This module is not enabled for this hotel.",
    checking: "Checking module access…",
  },
  de: {
    eyebrow: "KOSTENPFLICHTIGES ZUSATZMODUL",
    title: "Manager Intelligence",
    body: "Überwacht aktivierte Hotelmodule, zeigt wichtige Signale im Tagesverlauf und erstellt morgens einen Gesamtbericht zum Vortag.",
    open: "Manager Intelligence öffnen",
    locked: "Dieses Modul ist für dieses Hotel nicht aktiviert.",
    checking: "Modulzugriff wird geprüft…",
  },
} as const;

export default function ManagerIntelligenceAccessCard({ hotelSlug }: { hotelSlug: string }) {
  const { lang } = useStaffUi();
  const safeLang = lang === "de" || lang === "en" ? lang : "bg";
  const copy = COPY[safeLang];
  const [state, setState] = useState<"checking" | "active" | "locked">("checking");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/staff/manager-intelligence?hotelSlug=${encodeURIComponent(hotelSlug)}&language=${safeLang}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (cancelled) return;
        if (response.ok) setState("active");
        else if (response.status === 403) setState("locked");
        else setState("checking");
      })
      .catch(() => {
        if (!cancelled) setState("checking");
      });
    return () => { cancelled = true; };
  }, [hotelSlug, safeLang]);

  return (
    <section className="manager-module-card h-full min-h-[360px] rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
      <div className="flex h-full flex-col">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1479d3]">{copy.eyebrow}</p>
          <h3 className="mt-1.5 text-lg font-bold text-[#102a43]">{copy.title}</h3>
          <p className="mt-1.5 text-justify text-sm leading-6 text-slate-600">{copy.body}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-sky-800">
              {safeLang === "bg" ? "Сигнали в реално време" : safeLang === "de" ? "Live-Signale" : "Live Attention"}
            </span>
            <span className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-sky-800">
              {safeLang === "bg" ? "Сутрешен отчет" : safeLang === "de" ? "Morgenbericht" : "Morning Brief"}
            </span>
            <span className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-sky-800">
              {safeLang === "bg" ? "Анализ на всички модули" : safeLang === "de" ? "Modulübergreifende Analyse" : "Cross-module analysis"}
            </span>
          </div>
        </div>

        <div className="h-4" aria-hidden="true" />
        {state === "active" ? (
          <Link
            href={`/staff/${hotelSlug}/manager/intelligence`}
            className="gostaya-staff-primary-action mt-auto inline-flex w-fit min-h-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-bold text-sky-800 transition hover:bg-sky-100"
          >
            {copy.open} →
          </Link>
        ) : (
          <div className="mt-auto w-fit rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500">
            {state === "locked" ? copy.locked : copy.checking}
          </div>
        )}
      </div>
    </section>
  );
}
