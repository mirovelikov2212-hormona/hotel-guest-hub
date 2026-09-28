"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStaffUi } from "@/components/staff/StaffUiProvider";

const COPY = {
  bg: {
    eyebrow: "ДОПЪЛНИТЕЛЕН ПЛАТЕН МОДУЛ",
    title: "Manager Intelligence",
    body: "Следи активните модули на хотела, извежда важните сигнали през деня и подготвя пълен сутрешен отчет за предходния хотелски ден.",
    open: "Отвори Manager Intelligence",
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
    <section className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-violet-50 p-4 shadow-[0_12px_32px_rgba(15,58,91,.07)]">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#1479d3]">{copy.eyebrow}</p>
          <h3 className="mt-1.5 text-xl font-bold text-[#102a43]">{copy.title}</h3>
          <p className="mt-1.5 max-w-4xl text-sm leading-6 text-slate-600">{copy.body}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-sky-800">
              {safeLang === "bg" ? "Сигнали в реално време" : safeLang === "de" ? "Live-Signale" : "Live Attention"}
            </span>
            <span className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-violet-800">
              {safeLang === "bg" ? "Сутрешен отчет" : safeLang === "de" ? "Morgenbericht" : "Morning Brief"}
            </span>
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-emerald-800">
              {safeLang === "bg" ? "Анализ на всички модули" : safeLang === "de" ? "Modulübergreifende Analyse" : "Cross-module analysis"}
            </span>
          </div>
        </div>

        {state === "active" ? (
          <Link
            href={`/staff/${hotelSlug}/manager/intelligence`}
            className="gostaya-staff-primary-action inline-flex min-h-11 items-center justify-center rounded-xl border border-sky-300 bg-sky-200 px-5 py-2.5 text-sm font-bold text-[#0b4f75] shadow-sm transition hover:bg-sky-100 hover:text-[#083d5c]"
          >
            {copy.open} →
          </Link>
        ) : (
          <div className="max-w-xs rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500">
            {state === "locked" ? copy.locked : copy.checking}
          </div>
        )}
      </div>
    </section>
  );
}
