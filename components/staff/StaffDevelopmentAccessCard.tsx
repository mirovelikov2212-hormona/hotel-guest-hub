"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useStaffUi } from "@/components/staff/StaffUiProvider";

type Availability = {
  hotelSlug: string;
  role: string;
  runtimeRole: {
    kind: "manager" | "department";
    departmentCode: string | null;
    departmentName: string | null;
  };
  modules: {
    staffOperations: boolean;
    staffDevelopment: boolean;
    managerIntelligence: boolean;
  };
  entitlementSource: string;
};

const COPY = {
  bg: {
    title: "Развитие на персонала",
    managerTitle: "Персонал и Manager Intelligence",
    body: "Стандарти, обучения, тестове и проверими резултати.",
    managerBody:
      "Стандарти, обучения, тестове, verified results и управленски анализ.",
    open: "Отвори модула",
    intelligenceOn: "Manager Intelligence активен",
    intelligenceOff: "Manager Intelligence не е активен",
  },
  en: {
    title: "Staff Development",
    managerTitle: "Staff & Manager Intelligence",
    body: "Standards, training, assessments and verified results.",
    managerBody:
      "Standards, training, assessments, verified results and management analysis.",
    open: "Open module",
    intelligenceOn: "Manager Intelligence enabled",
    intelligenceOff: "Manager Intelligence not enabled",
  },
  de: {
    title: "Personalentwicklung",
    managerTitle: "Personal & Manager Intelligence",
    body: "Standards, Schulungen, Tests und verifizierte Ergebnisse.",
    managerBody:
      "Standards, Schulungen, Tests, verifizierte Ergebnisse und Management-Analyse.",
    open: "Modul öffnen",
    intelligenceOn: "Manager Intelligence aktiv",
    intelligenceOff: "Manager Intelligence nicht aktiv",
  },
} as const;

export default function StaffDevelopmentAccessCard({
  hotelSlug,
  role,
}: {
  hotelSlug: string;
  role: string;
}) {
  const { lang } = useStaffUi();
  const copy = COPY[lang] || COPY.en;
  const [availability, setAvailability] = useState<Availability | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams({ hotelSlug, role });
        const response = await fetch(
          `/api/staff/modules?${params.toString()}`,
          {
            cache: "no-store",
            credentials: "same-origin",
          },
        );
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; availability?: Availability }
          | null;

        if (
          !cancelled
          && response.ok
          && body?.ok
          && body.availability?.modules.staffDevelopment
        ) {
          setAvailability(body.availability);
        } else if (!cancelled) {
          setAvailability(null);
        }
      } catch {
        if (!cancelled) setAvailability(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [hotelSlug, role]);

  if (!availability?.modules.staffDevelopment) return null;

  const isManager = availability.runtimeRole.kind === "manager";
  const developmentRole = isManager
    ? "manager"
    : availability.runtimeRole.departmentCode || role;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
            {isManager ? copy.managerTitle : copy.title}
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/65">
            {isManager ? copy.managerBody : copy.body}
          </p>
          {isManager ? (
            <p className="mt-2 text-xs text-white/50">
              {availability.modules.managerIntelligence
                ? copy.intelligenceOn
                : copy.intelligenceOff}
            </p>
          ) : null}
        </div>
        <Link
          href={`/staff/${availability.hotelSlug}/${developmentRole}/development`}
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/15 bg-black/20 px-4 py-2.5 text-sm font-semibold text-white/90 transition hover:border-white/30"
        >
          {copy.open} →
        </Link>
      </div>
    </section>
  );
}
