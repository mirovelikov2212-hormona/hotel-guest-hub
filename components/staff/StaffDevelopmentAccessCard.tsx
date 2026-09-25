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

type AttentionSummary = {
  reportingDay: string;
  pendingHumanReviews: number;
  overdueTrainingAssignments: number;
  hrRuleFindings: number;
  notificationCandidates: number;
  hasAttention: boolean;
  decisionAuthority: "human_manager";
};

type AttentionState =
  | { status: "idle"; summary: null }
  | { status: "identity_required"; summary: null }
  | { status: "ready"; summary: AttentionSummary };

const COPY = {
  bg: {
    title: "Развитие на персонала",
    managerTitle: "Развитие на персонала",
    body: "Стандарти, обучения, тестове и проверими резултати.",
    managerBody:
      "Хотелски и departmental стандарти, обучения, тестове, проверими резултати и управленски анализ.",
    open: "Отвори модула",
    intelligenceOn: "Manager Intelligence активен",
    intelligenceOff: "Manager Intelligence не е активен",
    identify:
      "Влезте с личния Manager PIN в модула, за да виждате Staff Development сигналите тук.",
    reviews: "За проверка",
    overdue: "Просрочени обучения",
    hrSignals: "HR сигнали",
  },
  en: {
    title: "Staff Development",
    managerTitle: "Staff Development",
    body: "Standards, training, assessments and verified results.",
    managerBody:
      "Hotel and department standards, training, assessments, verified results and management analysis.",
    open: "Open module",
    intelligenceOn: "Manager Intelligence enabled",
    intelligenceOff: "Manager Intelligence not enabled",
    identify:
      "Identify with your personal Manager PIN in the module to see Staff Development attention here.",
    reviews: "Reviews",
    overdue: "Overdue training",
    hrSignals: "HR signals",
  },
  de: {
    title: "Personalentwicklung",
    managerTitle: "Personalentwicklung",
    body: "Standards, Schulungen, Tests und verifizierte Ergebnisse.",
    managerBody:
      "Hotel- und Abteilungsstandards, Schulungen, Tests, verifizierte Ergebnisse und Management-Analyse.",
    open: "Modul öffnen",
    intelligenceOn: "Manager Intelligence aktiv",
    intelligenceOff: "Manager Intelligence nicht aktiv",
    identify:
      "Identifizieren Sie sich im Modul mit Ihrer persönlichen Manager-PIN, um Hinweise hier zu sehen.",
    reviews: "Prüfungen",
    overdue: "Überfällige Schulungen",
    hrSignals: "HR-Hinweise",
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
  const [attention, setAttention] = useState<AttentionState>({
    status: "idle",
    summary: null,
  });

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
          cancelled
          || !response.ok
          || !body?.ok
          || !body.availability?.modules.staffDevelopment
        ) {
          if (!cancelled) {
            setAvailability(null);
            setAttention({ status: "idle", summary: null });
          }
          return;
        }

        setAvailability(body.availability);

        if (
          body.availability.runtimeRole.kind !== "manager"
          || !body.availability.modules.managerIntelligence
        ) {
          setAttention({ status: "idle", summary: null });
          return;
        }

        const attentionResponse = await fetch(
          `/api/staff/development/attention?hotelSlug=${encodeURIComponent(
            body.availability.hotelSlug,
          )}`,
          {
            cache: "no-store",
            credentials: "same-origin",
          },
        );
        const attentionBody = (await attentionResponse.json().catch(() => null)) as
          | { ok?: boolean; summary?: AttentionSummary }
          | null;

        if (cancelled) return;

        if (
          attentionResponse.ok
          && attentionBody?.ok
          && attentionBody.summary
        ) {
          setAttention({
            status: "ready",
            summary: attentionBody.summary,
          });
        } else if (attentionResponse.status === 401) {
          setAttention({ status: "identity_required", summary: null });
        } else {
          setAttention({ status: "idle", summary: null });
        }
      } catch {
        if (!cancelled) {
          setAvailability(null);
          setAttention({ status: "idle", summary: null });
        }
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
    <section className="h-full rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
            {isManager ? copy.managerTitle : copy.title}
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            {isManager ? copy.managerBody : copy.body}
          </p>

          {isManager ? (
            <p className="mt-2 text-xs text-slate-500">
              {availability.modules.managerIntelligence
                ? copy.intelligenceOn
                : copy.intelligenceOff}
            </p>
          ) : null}

          {isManager && attention.status === "identity_required" ? (
            <p className="mt-2 max-w-2xl text-xs leading-5 text-violet-700">
              {copy.identify}
            </p>
          ) : null}

          {isManager && attention.status === "ready" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                [copy.reviews, attention.summary.pendingHumanReviews],
                [copy.overdue, attention.summary.overdueTrainingAssignments],
                [copy.hrSignals, attention.summary.hrRuleFindings],
              ].map(([label, value]) => (
                <span
                  key={String(label)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
                >
                  {label}: <strong className="text-slate-900">{value}</strong>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <Link
          href={`/staff/${availability.hotelSlug}/${developmentRole}/development`}
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-violet-700 bg-violet-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-800"
        >
          {copy.open} →
        </Link>
      </div>
    </section>
  );
}
