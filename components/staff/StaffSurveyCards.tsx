"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Day3Survey, Day3SurveyApiResponse } from "@/lib/staff/survey-types";
import {
  formatSurveyDateTime,
  getSurveyCategoryLabel,
  getSurveyResolutionLabel,
  surveyNeedsAttention,
  type StaffSurveyLang,
} from "@/lib/staff/survey-display";

type StaffRoleWithSurveys = "manager" | "reception";

type SurveyCopy = {
  todayTitle: string;
  todayIntro: string;
  reportTitle: string;
  reportIntro: string;
  emptyToday: string;
  emptyReport: string;
  room: string;
  rating: string;
  submittedAt: string;
  categories: string;
  improvement: string;
  problem: string;
  resolution: string;
  resolutionNote: string;
  language: string;
  unread: string;
  read: string;
  markRead: string;
  marking: string;
  averageRating: string;
  ratingDistribution: string;
  topCategories: string;
  attentionRooms: string;
  unresolvedIssues: string;
  details: string;
  showDetails: string;
  hideDetails: string;
  testLabel: string;
};

const COPY: Record<StaffSurveyLang, SurveyCopy> = {
  bg: {
    todayTitle: "Анкети днес",
    todayIntro: "Попълнени Day 3 анкети в активния прозорец за реакция. Остават тук тази вечер и целия следващ ден.",
    reportTitle: "Обобщен отчет от анкетите",
    reportIntro: "История и обобщение на анкетите след активния прозорец. Няма втори копия — това са същите записи, преминали в отчет.",
    emptyToday: "Няма активни анкети в момента.",
    emptyReport: "Все още няма анкети, преминали в отчет.",
    room: "Стая",
    rating: "Оценка",
    submittedAt: "Попълнена",
    categories: "Категории",
    improvement: "Съвет за подобрение",
    problem: "Проблем",
    resolution: "Решен ли е проблемът",
    resolutionNote: "Допълнение",
    language: "Език",
    unread: "Нова",
    read: "Прочетена",
    markRead: "Прочетена",
    marking: "Маркиране...",
    averageRating: "Средна оценка",
    ratingDistribution: "Разпределение",
    topCategories: "Най-чести категории",
    attentionRooms: "Стаи за внимание",
    unresolvedIssues: "Нерешени/частични проблеми",
    details: "Детайли",
    showDetails: "Покажи детайли",
    hideDetails: "Скрий детайли",
    testLabel: "ТЕСТ",
  },
  en: {
    todayTitle: "Today's surveys",
    todayIntro: "Completed Day 3 surveys inside the active reaction window. They stay here tonight and throughout the next full day.",
    reportTitle: "Survey summary report",
    reportIntro: "History and summary after the active reaction window. No duplicate copies — these are the same records moved into reporting.",
    emptyToday: "There are no active surveys right now.",
    emptyReport: "No surveys have moved into the report yet.",
    room: "Room",
    rating: "Rating",
    submittedAt: "Submitted",
    categories: "Categories",
    improvement: "Improvement advice",
    problem: "Problem",
    resolution: "Problem resolved",
    resolutionNote: "Note",
    language: "Language",
    unread: "New",
    read: "Read",
    markRead: "Mark read",
    marking: "Marking...",
    averageRating: "Average rating",
    ratingDistribution: "Distribution",
    topCategories: "Top categories",
    attentionRooms: "Rooms needing attention",
    unresolvedIssues: "Unresolved/partial issues",
    details: "Details",
    showDetails: "Show details",
    hideDetails: "Hide details",
    testLabel: "TEST",
  },
  de: {
    todayTitle: "Umfragen heute",
    todayIntro: "Abgeschlossene Day-3-Umfragen im aktiven Reaktionsfenster. Sie bleiben heute Abend und den gesamten nächsten Tag sichtbar.",
    reportTitle: "Zusammenfassung der Umfragen",
    reportIntro: "Historie und Zusammenfassung nach dem aktiven Reaktionsfenster. Keine Duplikate — dieselben Einträge wechseln in den Bericht.",
    emptyToday: "Aktuell gibt es keine aktiven Umfragen.",
    emptyReport: "Noch keine Umfragen im Bericht.",
    room: "Zimmer",
    rating: "Bewertung",
    submittedAt: "Gesendet",
    categories: "Kategorien",
    improvement: "Verbesserungsvorschlag",
    problem: "Problem",
    resolution: "Problem gelöst",
    resolutionNote: "Notiz",
    language: "Sprache",
    unread: "Neu",
    read: "Gelesen",
    markRead: "Gelesen",
    marking: "Speichern...",
    averageRating: "Durchschnitt",
    ratingDistribution: "Verteilung",
    topCategories: "Häufigste Kategorien",
    attentionRooms: "Zimmer mit Aufmerksamkeit",
    unresolvedIssues: "Offene/teilweise Probleme",
    details: "Details",
    showDetails: "Details anzeigen",
    hideDetails: "Details ausblenden",
    testLabel: "TEST",
  },
};

function getCopy(lang: StaffSurveyLang) {
  return COPY[lang] || COPY.bg;
}

function normalizeSurveyArray(value: unknown): Day3Survey[] {
  return Array.isArray(value) ? (value as Day3Survey[]) : [];
}

export function useStaffSurveys({
  hotelSlug,
  role,
}: {
  hotelSlug?: string;
  role: StaffRoleWithSurveys;
}) {
  const [activeSurveys, setActiveSurveys] = useState<Day3Survey[]>([]);
  const [reportSurveys, setReportSurveys] = useState<Day3Survey[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loadSurveys = useCallback(async () => {
    const slug = String(hotelSlug || "").trim().toLowerCase();
    if (!slug) {
      setActiveSurveys([]);
      setReportSurveys([]);
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams({
        hotelSlug: slug,
        role,
        _: String(Date.now()),
      });
      const response = await fetch(`/api/staff/surveys?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      const payload = (await response.json().catch(() => null)) as Day3SurveyApiResponse | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Failed to fetch surveys: ${response.status}`);
      }

      setActiveSurveys(normalizeSurveyArray(payload.activeSurveys));
      setReportSurveys(normalizeSurveyArray(payload.reportSurveys));
    } catch (error) {
      console.error("Failed to load staff surveys", error);
    } finally {
      setLoading(false);
    }
  }, [hotelSlug, role]);

  useEffect(() => {
    void loadSurveys();
    const interval = window.setInterval(() => void loadSurveys(), 5000);
    return () => window.clearInterval(interval);
  }, [loadSurveys]);

  const markSurveyRead = useCallback(async (surveyId: string) => {
    const slug = String(hotelSlug || "").trim().toLowerCase();
    if (!slug || !surveyId) return;

    try {
      setMarkingId(surveyId);
      const response = await fetch("/api/staff/surveys/read", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelSlug: slug, role, surveyId }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; survey?: Day3Survey; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Failed to mark survey read: ${response.status}`);
      }

      if (payload.survey) {
        setActiveSurveys((items) => items.map((item) => (item.id === surveyId ? payload.survey! : item)));
        setReportSurveys((items) => items.map((item) => (item.id === surveyId ? payload.survey! : item)));
      } else {
        await loadSurveys();
      }
    } catch (error) {
      console.error("Failed to mark survey as read", error);
    } finally {
      setMarkingId(null);
    }
  }, [hotelSlug, loadSurveys, role]);

  return {
    activeSurveys,
    reportSurveys,
    loading,
    markingId,
    markSurveyRead,
    refreshSurveys: loadSurveys,
  };
}

function RatingBadge({ rating }: { rating: number }) {
  const classes =
    rating <= 2
      ? "border-rose-400/30 bg-rose-400/15 text-rose-100"
      : rating === 3
        ? "border-amber-400/30 bg-amber-400/15 text-amber-100"
        : "border-emerald-400/30 bg-emerald-400/15 text-emerald-100";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${classes}`}>
      {rating}/5
    </span>
  );
}

function getSurveyReadAt(survey: Day3Survey, mode: "manager" | "reception" | "report") {
  if (mode === "reception") return survey.receptionReadAt;
  if (mode === "manager") return survey.managerReadAt;
  return survey.managerReadAt || survey.receptionReadAt;
}

function SurveyDetailCard({
  survey,
  lang,
  mode,
  onMarkRead,
  marking,
}: {
  survey: Day3Survey;
  lang: StaffSurveyLang;
  mode: "manager" | "reception" | "report";
  onMarkRead?: (id: string) => void;
  marking?: boolean;
}) {
  const copy = getCopy(lang);
  const categories = survey.selectedCategories.map((key) => getSurveyCategoryLabel(key, lang));
  const readAt = getSurveyReadAt(survey, mode);
  const isUnread = !readAt && mode !== "report";
  const [isOpen, setIsOpen] = useState(isUnread || mode === "report");

  useEffect(() => {
    if (!isUnread && mode !== "report") setIsOpen(false);
  }, [isUnread, mode]);

  const handleMarkRead = () => {
    setIsOpen(false);
    onMarkRead?.(survey.id);
  };

  return (
    <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={isOpen}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-white">
              {copy.room} {survey.room}
            </h4>
            <RatingBadge rating={survey.rating} />
            {survey.isTest ? (
              <span className="rounded-full border border-fuchsia-300/35 bg-fuchsia-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-fuchsia-100">
                {copy.testLabel}
              </span>
            ) : null}

            {mode !== "report" ? (
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${isUnread ? "border-cyan-300/30 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/10 text-white/60"}`}>
                {isUnread ? copy.unread : copy.read}
              </span>
            ) : null}
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/50">
              {isOpen ? copy.hideDetails : copy.showDetails}
            </span>
          </div>
          <p className="mt-2 text-xs text-white/50">
            {copy.submittedAt}: {formatSurveyDateTime(survey.guestSubmittedAt, lang)} · {copy.language}: {survey.language.toUpperCase()}
          </p>
          {!isOpen ? (
            <p className="mt-2 truncate text-sm text-white/65">
              {categories.length ? categories.join(", ") : copy.rating} · {survey.problemText || survey.improvementText || getSurveyResolutionLabel(survey.resolutionStatus, lang)}
            </p>
          ) : null}
        </button>

        {mode !== "report" && isUnread && onMarkRead ? (
          <button
            type="button"
            onClick={handleMarkRead}
            disabled={marking}
            className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {marking ? copy.marking : copy.markRead}
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <>
          <div className="mt-4 grid gap-3 text-sm text-white/75 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-white/35">{copy.categories}</p>
              <p className="mt-2 leading-6">{categories.length ? categories.join(", ") : "—"}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-white/35">{copy.resolution}</p>
              <p className="mt-2 leading-6">{getSurveyResolutionLabel(survey.resolutionStatus, lang)}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 text-sm text-white/75 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-white/35">{copy.improvement}</p>
              <p className="mt-2 whitespace-pre-line leading-6">{survey.improvementText || "—"}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-white/35">{copy.problem}</p>
              <p className="mt-2 whitespace-pre-line leading-6">{survey.problemText || "—"}</p>
            </div>
          </div>

          {survey.resolutionNote ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/75">
              <p className="text-xs uppercase tracking-[0.16em] text-white/35">{copy.resolutionNote}</p>
              <p className="mt-2 whitespace-pre-line leading-6">{survey.resolutionNote}</p>
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

export function ManagerTodaySurveysCard({
  surveys,
  lang,
  markingId,
  onMarkRead,
}: {
  surveys: Day3Survey[];
  lang: StaffSurveyLang;
  markingId?: string | null;
  onMarkRead: (id: string) => void;
}) {
  const copy = getCopy(lang);

  return (
    <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/70">Day 3 survey</p>
          <h3 className="mt-1 text-xl font-semibold text-white">
            {copy.todayTitle} · {surveys.length}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">{copy.todayIntro}</p>
        </div>
        {surveys.some((survey) => !survey.managerReadAt) ? (
          <span className="rounded-full border border-cyan-300/30 bg-cyan-300/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-100">
            {surveys.filter((survey) => !survey.managerReadAt).length} {copy.unread}
          </span>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        {surveys.length ? (
          surveys.map((survey) => (
            <SurveyDetailCard
              key={survey.id}
              survey={survey}
              lang={lang}
              mode="manager"
              onMarkRead={onMarkRead}
              marking={markingId === survey.id}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">
            {copy.emptyToday}
          </div>
        )}
      </div>
    </section>
  );
}

export function ReceptionTodaySurveysCard({
  surveys,
  lang,
  markingId,
  onMarkRead,
}: {
  surveys: Day3Survey[];
  lang: StaffSurveyLang;
  markingId?: string | null;
  onMarkRead: (id: string) => void;
}) {
  const copy = getCopy(lang);

  return (
    <section className="rounded-2xl border border-rose-300/20 bg-rose-300/5 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-rose-100/70">Day 3 survey</p>
          <h3 className="mt-1 text-xl font-semibold text-white">
            {copy.todayTitle} · {surveys.length}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
            {lang === "de"
              ? "Nur kritische Bewertungen 1–3. Diese Karte ist ein operatives Signal, kein Bericht."
              : lang === "en"
                ? "Only critical ratings 1–3. This card is an operational signal, not a report."
                : "Само критични оценки 1–3. Това е оперативен сигнал, не отчет."}
          </p>
        </div>
        {surveys.some((survey) => !survey.receptionReadAt) ? (
          <span className="rounded-full border border-rose-300/30 bg-rose-300/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-100">
            {surveys.filter((survey) => !survey.receptionReadAt).length} {copy.unread}
          </span>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        {surveys.length ? (
          surveys.map((survey) => (
            <SurveyDetailCard
              key={survey.id}
              survey={survey}
              lang={lang}
              mode="reception"
              onMarkRead={onMarkRead}
              marking={markingId === survey.id}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">
            {copy.emptyToday}
          </div>
        )}
      </div>
    </section>
  );
}

export type SurveyDaySummary = {
  dateKey: string;
  surveys: Day3Survey[];
  averageRating: number;
  ratingDistribution: Record<number, number>;
  topCategories: Array<{ key: string; count: number }>;
  attentionRooms: string[];
  unresolvedCount: number;
};

export function buildSurveyDaySummaries(surveys: Day3Survey[]): SurveyDaySummary[] {
  const byDate = new Map<string, Day3Survey[]>();

  for (const survey of surveys) {
    const key = survey.hotelDateKey || survey.guestSubmittedAt.slice(0, 10);
    byDate.set(key, [...(byDate.get(key) || []), survey]);
  }

  return Array.from(byDate.entries())
    .map(([dateKey, items]) => {
      const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const categoryCounts = new Map<string, number>();
      const attentionRooms = new Set<string>();
      let unresolvedCount = 0;

      for (const survey of items) {
        ratingDistribution[survey.rating] = (ratingDistribution[survey.rating] || 0) + 1;
        survey.selectedCategories.forEach((category) => categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1));
        if (surveyNeedsAttention(survey)) attentionRooms.add(survey.room);
        if (survey.resolutionStatus === "partially_resolved" || survey.resolutionStatus === "not_resolved") {
          unresolvedCount += 1;
        }
      }

      return {
        dateKey,
        surveys: [...items].sort((a, b) => new Date(b.guestSubmittedAt).getTime() - new Date(a.guestSubmittedAt).getTime()),
        averageRating: items.reduce((sum, survey) => sum + survey.rating, 0) / Math.max(1, items.length),
        ratingDistribution,
        topCategories: Array.from(categoryCounts.entries())
          .map(([key, count]) => ({ key, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
        attentionRooms: Array.from(attentionRooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        unresolvedCount,
      };
    })
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

export function ManagerSurveyReportCard({
  surveys,
  lang,
}: {
  surveys: Day3Survey[];
  lang: StaffSurveyLang;
}) {
  const copy = getCopy(lang);
  const summaries = useMemo(() => buildSurveyDaySummaries(surveys), [surveys]);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-lg font-semibold text-white">
          {copy.reportTitle} · {surveys.length}
        </h4>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">{copy.reportIntro}</p>
      </div>

      <div className="space-y-4">
        {summaries.length ? (
          summaries.map((summary) => (
            <details key={summary.dateKey} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-white">{summary.dateKey}</h4>
                    <p className="mt-1 text-sm text-white/60">
                      {summary.surveys.length} анкети · {copy.averageRating}: {summary.averageRating.toFixed(1)}/5
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-white/70">
                      {copy.unresolvedIssues}: {summary.unresolvedCount}
                    </span>
                    {summary.attentionRooms.length ? (
                      <span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-3 py-1 text-amber-100">
                        {copy.attentionRooms}: {summary.attentionRooms.join(", ")}
                      </span>
                    ) : null}
                  </div>
                </div>
              </summary>

              <div className="mt-4 grid gap-3 text-sm text-white/75 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/35">{copy.ratingDistribution}</p>
                  <p className="mt-2 leading-6">
                    {[1, 2, 3, 4, 5].map((rating) => `${rating}: ${summary.ratingDistribution[rating] || 0}`).join(" · ")}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/35">{copy.topCategories}</p>
                  <p className="mt-2 leading-6">
                    {summary.topCategories.length
                      ? summary.topCategories.map((item) => `${getSurveyCategoryLabel(item.key, lang)} × ${item.count}`).join(" · ")
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/35">{copy.attentionRooms}</p>
                  <p className="mt-2 leading-6">{summary.attentionRooms.length ? summary.attentionRooms.join(", ") : "—"}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {summary.surveys.map((survey) => (
                  <SurveyDetailCard key={survey.id} survey={survey} lang={lang} mode="report" />
                ))}
              </div>
            </details>
          ))
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">
            {copy.emptyReport}
          </div>
        )}
      </div>
    </div>
  );
}
