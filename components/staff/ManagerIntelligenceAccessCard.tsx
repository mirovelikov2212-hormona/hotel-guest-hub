"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStaffUi } from "@/components/staff/StaffUiProvider";

const COPY = {
  bg: {
    eyebrow: "Допълнителен платен модул",
    title: "Мениджърски анализ",
    body: "Следи активните модули на хотела, извежда важните сигнали през деня и подготвя пълен сутрешен отчет за предходния хотелски ден.",
    open: "Отвори мениджърския анализ",
    locked: "Модулът не е активиран за този хотел.",
    checking: "Проверка на модула…",
  },
  en: {
    eyebrow: "Paid add-on",
    title: "Manager Intelligence",
    body: "Monitors enabled hotel modules, surfaces important signals during the day and prepares a full morning brief for the previous hotel day.",
    open: "Open Manager Intelligence",
    locked: "This module is not enabled for this hotel.",
    checking: "Checking module access…",
  },
  de: {
    eyebrow: "Kostenpflichtiges Zusatzmodul",
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
    <section className="manager-module-card h-full rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
      <h3 className="manager-module-title text-xs font-semibold uppercase tracking-[0.16em]">{copy.title}</h3>
      <p className="mt-1 text-xs font-medium text-slate-500">{copy.eyebrow}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{copy.body}</p>

      {state === "active" ? (
        <Link
          href={`/staff/${hotelSlug}/manager/intelligence`}
          className="manager-module-action mt-4 inline-flex w-fit min-h-10 items-center justify-center rounded-xl border px-4 py-2 text-sm font-bold transition"
        >
          {copy.open} →
        </Link>
      ) : (
        <div className="mt-4 w-fit rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500">
          {state === "locked" ? copy.locked : copy.checking}
        </div>
      )}
    </section>
  );
}
