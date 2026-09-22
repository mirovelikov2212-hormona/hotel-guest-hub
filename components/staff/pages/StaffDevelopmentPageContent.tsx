"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useStaffUi } from "@/components/staff/StaffUiProvider";
import StaffStandardAuthoringPanel from "@/components/staff/StaffStandardAuthoringPanel";
import StaffAssessmentAuthoringPanel from "@/components/staff/StaffAssessmentAuthoringPanel";
import StaffHrRulesPanel from "@/components/staff/StaffHrRulesPanel";

type Candidate = {
  staffUserId: string;
  fullName: string;
  role: string;
  credentialConfigured: boolean;
};

type Identity = {
  sessionId: string;
  hotelId: string;
  staffUserId: string;
  operationalRole: string;
  staffUserRole: string;
  departmentId: string | null;
  fullName: string | null;
  expiresAt: string;
};

type IdentityResponse = {
  ok?: boolean;
  identity?: Identity | null;
  candidates?: Candidate[];
  writesEnabled?: boolean;
  error?: string;
};

type OwnState = {
  identity: Identity;
  assignments: Array<Record<string, any>>;
  verifiedResults: Array<Record<string, any>>;
};

type ManagerState = {
  identity: Identity;
  staff: Array<Record<string, any>>;
  standards: Array<Record<string, any>>;
  trainingPlans: Array<Record<string, any>>;
  assignments: Array<Record<string, any>>;
  pendingReviews: Array<Record<string, any>>;
  verifiedResults: Array<Record<string, any>>;
  hrRules: Array<Record<string, any>>;
  hrEvaluations: Array<Record<string, any>>;
};

const COPY = {
  bg: {
    back: "Назад към оперативния панел",
    title: "Развитие на персонала",
    subtitle: "Стандарти, обучение, тестове и проверими резултати",
    identityTitle: "Кой служител използва обучението?",
    identityHelp: "Оперативният PIN отваря отдела. Тук се идентифицирате лично за обучение и тестове.",
    person: "Служител",
    personalPin: "Личен PIN",
    enter: "Вход в обучението",
    initialSetup: "Първоначална настройка на Manager PIN",
    bootstrap: "Създай първия Manager PIN",
    locked: "Записите са заключени до финалния системен E2E тест.",
    identityAs: "Идентифициран като",
    logout: "Изход от обучението",
    myTraining: "Моето обучение",
    managerView: "Manager преглед",
    noAssignments: "Няма възложени обучения.",
    assigned: "Възложено",
    due: "Срок",
    completed: "Завършено",
    pending: "Предстои",
    trainingUnits: "Учебни теми",
    markComplete: "Потвърди завършено обучение",
    assessment: "Тест",
    submitTest: "Предай теста",
    pendingReview: "Очаква проверка от Manager",
    passed: "Издържан",
    failed: "Неиздържан",
    verifiedResults: "Проверени резултати",
    staff: "Служители",
    standards: "Стандарти",
    plans: "Обучения",
    assignments: "Възлагания",
    reviews: "За проверка",
    hr: "HR анализ",
    assign: "Възложи обучение",
    chooseStaff: "Избери служител",
    choosePlan: "Избери обучение",
    setPin: "Задай личен PIN",
    review: "Провери",
    points: "Точки",
    note: "Бележка",
    saveReview: "Потвърди проверката",
    evaluate: "Преизчисли HR правилата",
    noPendingReviews: "Няма тестове, чакащи човешка проверка.",
    humanDecision: "HR правилата и AI анализът са помощ за Manager-а. Решението остава човешко.",
    refresh: "Обнови",
    disabledAction: "Функцията е подготвена, но записването е заключено до финалния E2E тест.",
    error: "Възникна грешка.",
  },
  en: {
    back: "Back to operations",
    title: "Staff Development",
    subtitle: "Standards, training, assessments and verified results",
    identityTitle: "Which employee is using training?",
    identityHelp: "The operational PIN opens the department. Identify yourself personally here for training and assessments.",
    person: "Employee",
    personalPin: "Personal PIN",
    enter: "Enter training",
    initialSetup: "Initial Manager PIN setup",
    bootstrap: "Create first Manager PIN",
    locked: "Writes are locked until the final system E2E test.",
    identityAs: "Identified as",
    logout: "Leave training",
    myTraining: "My Training",
    managerView: "Manager overview",
    noAssignments: "No training assignments.",
    assigned: "Assigned",
    due: "Due",
    completed: "Completed",
    pending: "Pending",
    trainingUnits: "Training units",
    markComplete: "Confirm training completion",
    assessment: "Assessment",
    submitTest: "Submit assessment",
    pendingReview: "Awaiting Manager review",
    passed: "Passed",
    failed: "Not passed",
    verifiedResults: "Verified results",
    staff: "Staff",
    standards: "Standards",
    plans: "Training plans",
    assignments: "Assignments",
    reviews: "Pending reviews",
    hr: "HR analysis",
    assign: "Assign training",
    chooseStaff: "Choose employee",
    choosePlan: "Choose training",
    setPin: "Set personal PIN",
    review: "Review",
    points: "Points",
    note: "Note",
    saveReview: "Confirm review",
    evaluate: "Re-evaluate HR rules",
    noPendingReviews: "No assessments awaiting human review.",
    humanDecision: "HR rules and AI analysis support the Manager. Employment decisions remain human.",
    refresh: "Refresh",
    disabledAction: "The feature is ready, but writes are locked until the final E2E test.",
    error: "Something went wrong.",
  },
  de: {
    back: "Zurück zum Betriebsbereich",
    title: "Personalentwicklung",
    subtitle: "Standards, Schulungen, Tests und verifizierte Ergebnisse",
    identityTitle: "Welcher Mitarbeiter nutzt die Schulung?",
    identityHelp: "Der operative PIN öffnet die Abteilung. Für Schulungen und Tests erfolgt hier die persönliche Identifikation.",
    person: "Mitarbeiter",
    personalPin: "Persönliche PIN",
    enter: "Schulung öffnen",
    initialSetup: "Ersteinrichtung der Manager-PIN",
    bootstrap: "Erste Manager-PIN erstellen",
    locked: "Schreibzugriffe bleiben bis zum finalen E2E-Systemtest gesperrt.",
    identityAs: "Identifiziert als",
    logout: "Schulung verlassen",
    myTraining: "Meine Schulung",
    managerView: "Manager-Übersicht",
    noAssignments: "Keine Schulungen zugewiesen.",
    assigned: "Zugewiesen",
    due: "Frist",
    completed: "Abgeschlossen",
    pending: "Offen",
    trainingUnits: "Lerninhalte",
    markComplete: "Schulung als abgeschlossen bestätigen",
    assessment: "Test",
    submitTest: "Test abgeben",
    pendingReview: "Wartet auf Manager-Prüfung",
    passed: "Bestanden",
    failed: "Nicht bestanden",
    verifiedResults: "Verifizierte Ergebnisse",
    staff: "Mitarbeiter",
    standards: "Standards",
    plans: "Schulungen",
    assignments: "Zuweisungen",
    reviews: "Zu prüfen",
    hr: "HR-Analyse",
    assign: "Schulung zuweisen",
    chooseStaff: "Mitarbeiter auswählen",
    choosePlan: "Schulung auswählen",
    setPin: "Persönliche PIN setzen",
    review: "Prüfen",
    points: "Punkte",
    note: "Notiz",
    saveReview: "Prüfung bestätigen",
    evaluate: "HR-Regeln neu auswerten",
    noPendingReviews: "Keine Tests warten auf menschliche Prüfung.",
    humanDecision: "HR-Regeln und KI-Analyse unterstützen den Manager. Personalentscheidungen bleiben menschlich.",
    refresh: "Aktualisieren",
    disabledAction: "Die Funktion ist vorbereitet, Schreibzugriffe bleiben aber bis zum finalen E2E-Test gesperrt.",
    error: "Ein Fehler ist aufgetreten.",
  },
} as const;

function displayText(value: any, lang: string) {
  if (!value || typeof value !== "object") return "";
  return String(
    value[lang]
    || value.en
    || value.bg
    || Object.values(value).find(Boolean)
    || "",
  );
}

function formatDate(value: unknown) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function scoreFromResult(row: Record<string, any>) {
  const score = Number(
    row?.scorePercent
    ?? row?.result_json?.scorePercent
    ?? row?.result_json?.autoScorePercent,
  );
  return Number.isFinite(score) ? score : null;
}

export default function StaffDevelopmentPageContent({
  hotelSlug,
  operationalRole,
}: {
  hotelSlug: string;
  operationalRole: string;
}) {
  const { lang } = useStaffUi();
  const copy = COPY[lang] || COPY.en;

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [writesEnabled, setWritesEnabled] = useState(false);
  const [selectedStaffUserId, setSelectedStaffUserId] = useState("");
  const [pin, setPin] = useState("");
  const [ownState, setOwnState] = useState<OwnState | null>(null);
  const [managerState, setManagerState] = useState<ManagerState | null>(null);
  const [view, setView] = useState<"own" | "manager">("own");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [completedUnits, setCompletedUnits] = useState<Record<string, string[]>>({});
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [assignStaffId, setAssignStaffId] = useState("");
  const [assignPlanId, setAssignPlanId] = useState("");
  const [assignDueAt, setAssignDueAt] = useState("");
  const [newPersonalPin, setNewPersonalPin] = useState("");
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, Record<string, { pointsAwarded: string; note: string }>>>({});

  const managerCapable =
    identity?.staffUserRole === "department_manager"
    || identity?.staffUserRole === "hotel_manager";

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.staffUserId === selectedStaffUserId) || null,
    [candidates, selectedStaffUserId],
  );

  const loadIdentity = useCallback(async () => {
    const params = new URLSearchParams({
      hotelSlug,
      operationalRole,
    });
    const response = await fetch(
      `/api/staff/development/identity?${params.toString()}`,
      { cache: "no-store", credentials: "same-origin" },
    );
    const body = await response.json().catch(() => null) as IdentityResponse | null;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error || "STAFF_DEVELOPMENT_IDENTITY_LOAD_FAILED");
    }

    setIdentity(body.identity || null);
    setCandidates(body.candidates || []);
    setWritesEnabled(body.writesEnabled === true);
    if (!selectedStaffUserId && body.candidates?.length) {
      setSelectedStaffUserId(body.candidates[0].staffUserId);
    }
    return body.identity || null;
  }, [hotelSlug, operationalRole, selectedStaffUserId]);

  const loadState = useCallback(async (nextIdentity?: Identity | null) => {
    const activeIdentity = nextIdentity === undefined ? identity : nextIdentity;
    if (!activeIdentity) {
      setOwnState(null);
      setManagerState(null);
      return;
    }

    const ownResponse = await fetch(
      `/api/staff/development/state?hotelSlug=${encodeURIComponent(hotelSlug)}&view=own`,
      { cache: "no-store", credentials: "same-origin" },
    );
    const ownBody = await ownResponse.json().catch(() => null) as any;
    if (!ownResponse.ok || !ownBody?.ok) {
      throw new Error(ownBody?.error || "STAFF_DEVELOPMENT_STATE_LOAD_FAILED");
    }
    setOwnState(ownBody.state);

    if (
      activeIdentity.staffUserRole === "department_manager"
      || activeIdentity.staffUserRole === "hotel_manager"
    ) {
      const managerResponse = await fetch(
        `/api/staff/development/state?hotelSlug=${encodeURIComponent(hotelSlug)}&view=manager`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const managerBody = await managerResponse.json().catch(() => null) as any;
      if (!managerResponse.ok || !managerBody?.ok) {
        throw new Error(managerBody?.error || "STAFF_DEVELOPMENT_MANAGER_STATE_LOAD_FAILED");
      }
      setManagerState(managerBody.state);
    } else {
      setManagerState(null);
      setView("own");
    }
  }, [hotelSlug, identity]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const current = await loadIdentity();
      await loadState(current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [loadIdentity, loadState]);

  useEffect(() => {
    void refresh();
  }, [hotelSlug, operationalRole]);

  async function postJson(url: string, payload: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null) as any;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error || "STAFF_DEVELOPMENT_ACTION_FAILED");
    }
    return body;
  }

  async function authenticate(action: "authenticate" | "bootstrap_manager") {
    if (!selectedStaffUserId || !pin) return;
    setWorking(true);
    setError("");
    try {
      await postJson("/api/staff/development/identity", {
        action,
        hotelSlug,
        operationalRole,
        staffUserId: selectedStaffUserId,
        personalPin: pin,
      });
      setPin("");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  }

  async function logout() {
    setWorking(true);
    try {
      await fetch("/api/staff/development/identity", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelSlug }),
      });
      setIdentity(null);
      setOwnState(null);
      setManagerState(null);
      setView("own");
      await loadIdentity();
    } finally {
      setWorking(false);
    }
  }

  async function action(payload: Record<string, unknown>) {
    if (!writesEnabled) {
      setError(copy.disabledAction);
      return null;
    }

    setWorking(true);
    setError("");
    try {
      const body = await postJson("/api/staff/development/actions", {
        hotelSlug,
        ...payload,
      });
      await loadState();
      return body.result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setWorking(false);
    }
  }

  function toggleCompletedUnit(assignmentId: string, unitId: string) {
    setCompletedUnits((current) => {
      const active = current[assignmentId] || [];
      return {
        ...current,
        [assignmentId]: active.includes(unitId)
          ? active.filter((value) => value !== unitId)
          : [...active, unitId],
      };
    });
  }

  if (loading) {
    return (
      <section className="rounded-3xl border p-6 shadow-sm">
        <p className="text-sm opacity-65">Loading Staff Development…</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              href={`/staff/${hotelSlug}/${operationalRole}`}
              className="text-xs font-semibold opacity-60 hover:opacity-100"
            >
              ← {copy.back}
            </Link>
            <h2 className="mt-3 text-2xl font-semibold">{copy.title}</h2>
            <p className="mt-1 text-sm opacity-65">{copy.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-xl border px-3 py-2 text-sm font-semibold"
          >
            {copy.refresh}
          </button>
        </div>

        {!writesEnabled ? (
          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm">
            {copy.locked}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm">
            {error}
          </div>
        ) : null}
      </section>

      {!identity ? (
        <section className="rounded-3xl border p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-semibold">{copy.identityTitle}</h3>
          <p className="mt-1 text-sm opacity-65">{copy.identityHelp}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold opacity-60">{copy.person}</span>
              <select
                value={selectedStaffUserId}
                onChange={(event) => setSelectedStaffUserId(event.target.value)}
                className="w-full rounded-xl border bg-transparent px-3 py-2.5"
              >
                {candidates.map((candidate) => (
                  <option key={candidate.staffUserId} value={candidate.staffUserId}>
                    {candidate.fullName || candidate.staffUserId} · {candidate.role}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold opacity-60">{copy.personalPin}</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                className="w-full rounded-xl border bg-transparent px-3 py-2.5"
                placeholder="••••••"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={working || !writesEnabled || !selectedCandidate?.credentialConfigured}
              onClick={() => void authenticate("authenticate")}
              className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              {copy.enter}
            </button>

            {operationalRole === "manager"
              && selectedCandidate
              && !selectedCandidate.credentialConfigured ? (
                <button
                  type="button"
                  disabled={working || !writesEnabled}
                  onClick={() => void authenticate("bootstrap_manager")}
                  className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                >
                  {copy.bootstrap}
                </button>
              ) : null}
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-3xl border p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-55">
                  {copy.identityAs}
                </p>
                <p className="mt-1 font-semibold">
                  {identity.fullName || identity.staffUserId}
                </p>
                <p className="text-xs opacity-55">
                  {identity.staffUserRole} · {identity.operationalRole}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {managerCapable ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setView("own")}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold ${view === "own" ? "bg-black/10" : ""}`}
                    >
                      {copy.myTraining}
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("manager")}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold ${view === "manager" ? "bg-black/10" : ""}`}
                    >
                      {copy.managerView}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-xl border px-3 py-2 text-sm font-semibold"
                >
                  {copy.logout}
                </button>
              </div>
            </div>
          </section>

          {view === "own" ? (
            <div className="space-y-4">
              {(ownState?.assignments || []).length === 0 ? (
                <section className="rounded-3xl border p-6 text-sm opacity-65">
                  {copy.noAssignments}
                </section>
              ) : null}

              {(ownState?.assignments || []).map((assignment) => {
                const plan = assignment.plan?.plan;
                const units = Array.isArray(plan?.units) ? plan.units : [];
                const completion = assignment.completion;
                const selectedUnits = completedUnits[String(assignment.id)] || [];
                const assessments = Array.isArray(assignment.assessments)
                  ? assignment.assessments
                  : [];

                return (
                  <section key={String(assignment.id)} className="rounded-3xl border p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {displayText(plan?.units?.[0]?.titleByLang, lang) || copy.myTraining}
                        </h3>
                        <p className="mt-1 text-xs opacity-55">
                          {copy.assigned}: {formatDate(assignment.assigned_at)}
                          {assignment.due_at ? ` · ${copy.due}: ${formatDate(assignment.due_at)}` : ""}
                        </p>
                      </div>
                      <span className="rounded-full border px-3 py-1 text-xs font-semibold">
                        {completion ? copy.completed : copy.pending}
                      </span>
                    </div>

                    <h4 className="mt-5 text-sm font-semibold">{copy.trainingUnits}</h4>
                    <div className="mt-2 space-y-2">
                      {units.map((unit: any) => (
                        <label key={String(unit.unitId)} className="block rounded-2xl border p-3">
                          <div className="flex gap-3">
                            {!completion ? (
                              <input
                                type="checkbox"
                                checked={selectedUnits.includes(String(unit.unitId))}
                                onChange={() => toggleCompletedUnit(String(assignment.id), String(unit.unitId))}
                              />
                            ) : null}
                            <div>
                              <p className="font-semibold">
                                {displayText(unit.titleByLang, lang) || unit.unitId}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm opacity-70">
                                {displayText(unit.bodyByLang, lang)}
                              </p>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>

                    {!completion && units.length ? (
                      <button
                        type="button"
                        disabled={working || selectedUnits.length !== units.length}
                        onClick={() => void action({
                          action: "complete_training",
                          assignmentId: assignment.id,
                          completedUnitIds: selectedUnits,
                        })}
                        className="mt-3 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
                      >
                        {copy.markComplete}
                      </button>
                    ) : null}

                    {completion ? assessments.map((assessment: any) => {
                      const learner = assessment.learner || {};
                      const latestAttempt = assessment.attempts?.[0] || null;
                      const assessmentAnswers = answers[String(assessment.id)] || {};

                      return (
                        <div key={String(assessment.id)} className="mt-5 border-t pt-5">
                          <h4 className="font-semibold">
                            {copy.assessment}: {assessment.assessmentKey}
                          </h4>

                          {latestAttempt ? (
                            <p className="mt-1 text-xs opacity-60">
                              #{latestAttempt.attempt_no} · {
                                latestAttempt.attempt_status === "pending_human_review"
                                  ? copy.pendingReview
                                  : (
                                      latestAttempt.passed
                                        ? copy.passed
                                        : copy.failed
                                    )
                              }
                            </p>
                          ) : null}

                          <div className="mt-3 space-y-4">
                            {(learner.questions || []).map((question: any) => (
                              <div key={String(question.id)} className="rounded-2xl border p-3">
                                {question.scenarioByLang ? (
                                  <p className="mb-2 rounded-xl bg-black/5 p-2 text-sm opacity-75">
                                    {displayText(question.scenarioByLang, lang)}
                                  </p>
                                ) : null}
                                <p className="font-medium">
                                  {displayText(question.promptByLang, lang)}
                                </p>

                                {question.type === "free_text" ? (
                                  <textarea
                                    value={assessmentAnswers[question.id] || ""}
                                    onChange={(event) => setAnswers((current) => ({
                                      ...current,
                                      [String(assessment.id)]: {
                                        ...(current[String(assessment.id)] || {}),
                                        [question.id]: event.target.value,
                                      },
                                    }))}
                                    className="mt-2 min-h-24 w-full rounded-xl border bg-transparent p-3 text-sm"
                                  />
                                ) : (
                                  <div className="mt-2 space-y-2">
                                    {(question.options || []).map((option: any) => (
                                      <label key={String(option.id)} className="flex gap-2 text-sm">
                                        <input
                                          type="radio"
                                          name={`${assessment.id}-${question.id}`}
                                          value={option.id}
                                          checked={assessmentAnswers[question.id] === option.id}
                                          onChange={() => setAnswers((current) => ({
                                            ...current,
                                            [String(assessment.id)]: {
                                              ...(current[String(assessment.id)] || {}),
                                              [question.id]: option.id,
                                            },
                                          }))}
                                        />
                                        <span>{displayText(option.textByLang, lang)}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            disabled={working}
                            onClick={() => void action({
                              action: "submit_assessment",
                              trainingAssignmentId: assignment.id,
                              assessmentRevisionId: assessment.id,
                              answers: assessmentAnswers,
                            })}
                            className="mt-3 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
                          >
                            {copy.submitTest}
                          </button>
                        </div>
                      );
                    }) : null}
                  </section>
                );
              })}

              {(ownState?.verifiedResults || []).length ? (
                <section className="rounded-3xl border p-5 shadow-sm">
                  <h3 className="font-semibold">{copy.verifiedResults}</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {(ownState?.verifiedResults || []).map((row) => {
                      const score = scoreFromResult(row);
                      const passed = row.passed;
                      return (
                        <div key={String(row.id)} className="rounded-2xl border p-3">
                          <p className="text-sm font-semibold">
                            {score === null ? "—" : `${score}%`}
                          </p>
                          <p className="mt-1 text-xs opacity-60">
                            {passed ? copy.passed : copy.failed} · {formatDate(row.verified_at)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <ManagerOverview
              hotelSlug={hotelSlug}
              operationalRole={operationalRole}
              state={managerState}
              lang={lang}
              copy={copy}
              working={working}
              writesEnabled={writesEnabled}
              assignStaffId={assignStaffId}
              setAssignStaffId={setAssignStaffId}
              assignPlanId={assignPlanId}
              setAssignPlanId={setAssignPlanId}
              assignDueAt={assignDueAt}
              setAssignDueAt={setAssignDueAt}
              newPersonalPin={newPersonalPin}
              setNewPersonalPin={setNewPersonalPin}
              reviewDrafts={reviewDrafts}
              setReviewDrafts={setReviewDrafts}
              action={action}
            />
          )}
        </>
      )}
    </div>
  );
}

function ManagerOverview({
  hotelSlug,
  operationalRole,
  state,
  lang,
  copy,
  working,
  writesEnabled,
  assignStaffId,
  setAssignStaffId,
  assignPlanId,
  setAssignPlanId,
  assignDueAt,
  setAssignDueAt,
  newPersonalPin,
  setNewPersonalPin,
  reviewDrafts,
  setReviewDrafts,
  action,
}: any) {
  if (!state) return null;

  const staff = state.staff || [];
  const plans = state.trainingPlans || [];
  const pendingReviews = state.pendingReviews || [];

  return (
    <div className="space-y-4">
      <StaffStandardAuthoringPanel
        hotelSlug={hotelSlug}
        lang={lang}
        writesEnabled={writesEnabled}
        operationalRole={operationalRole}
      />

      <StaffAssessmentAuthoringPanel
        hotelSlug={hotelSlug}
        lang={lang}
        writesEnabled={writesEnabled}
        trainingPlans={plans}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [copy.staff, staff.length],
          [copy.standards, state.standards?.length || 0],
          [copy.plans, plans.length],
          [copy.assignments, state.assignments?.length || 0],
          [copy.reviews, pendingReviews.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-55">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border p-5 shadow-sm">
        <h3 className="font-semibold">{copy.assign}</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-4">
          <select
            value={assignStaffId}
            onChange={(event) => setAssignStaffId(event.target.value)}
            className="rounded-xl border bg-transparent px-3 py-2"
          >
            <option value="">{copy.chooseStaff}</option>
            {staff.map((row: any) => (
              <option key={row.id} value={row.id}>{row.full_name || row.id}</option>
            ))}
          </select>
          <select
            value={assignPlanId}
            onChange={(event) => setAssignPlanId(event.target.value)}
            className="rounded-xl border bg-transparent px-3 py-2"
          >
            <option value="">{copy.choosePlan}</option>
            {plans.map((row: any) => (
              <option key={row.id} value={row.id}>
                {row.plan_json?.sourceStandardKey || row.training_plan_hash?.slice(0, 10)}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={assignDueAt}
            onChange={(event) => setAssignDueAt(event.target.value)}
            className="rounded-xl border bg-transparent px-3 py-2"
          />
          <button
            type="button"
            disabled={working || !writesEnabled || !assignStaffId || !assignPlanId}
            onClick={() => void action({
              action: "assign_training",
              targetStaffUserId: assignStaffId,
              trainingPlanRevisionId: assignPlanId,
              dueAt: assignDueAt ? new Date(`${assignDueAt}T23:59:59`).toISOString() : null,
            })}
            className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {copy.assign}
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px_auto]">
          <select
            value={assignStaffId}
            onChange={(event) => setAssignStaffId(event.target.value)}
            className="rounded-xl border bg-transparent px-3 py-2"
          >
            <option value="">{copy.chooseStaff}</option>
            {staff.map((row: any) => (
              <option key={row.id} value={row.id}>{row.full_name || row.id}</option>
            ))}
          </select>
          <input
            type="password"
            inputMode="numeric"
            value={newPersonalPin}
            onChange={(event) => setNewPersonalPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder={copy.personalPin}
            className="rounded-xl border bg-transparent px-3 py-2"
          />
          <button
            type="button"
            disabled={working || !writesEnabled || !assignStaffId || newPersonalPin.length < 6}
            onClick={() => void action({
              action: "set_personal_pin",
              targetStaffUserId: assignStaffId,
              personalPin: newPersonalPin,
            }).then((result: unknown) => {
              if (result) setNewPersonalPin("");
            })}
            className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {copy.setPin}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border p-5 shadow-sm">
        <h3 className="font-semibold">{copy.reviews}</h3>
        {!pendingReviews.length ? (
          <p className="mt-2 text-sm opacity-60">{copy.noPendingReviews}</p>
        ) : (
          <div className="mt-3 space-y-4">
            {pendingReviews.map((attempt: any) => {
              const pendingQuestions = (attempt.attempt_json?.questionResults || [])
                .filter((question: any) => question.status === "pending_human_review");
              const staffName =
                staff.find((row: any) => String(row.id) === String(attempt.staff_user_id))?.full_name
                || attempt.staff_user_id;

              return (
                <div key={attempt.id} className="rounded-2xl border p-4">
                  <p className="font-semibold">{staffName}</p>
                  <p className="mt-1 text-xs opacity-55">
                    {attempt.assessment?.assessment_key || copy.assessment}
                    {" · "}#{attempt.attempt_no}
                  </p>

                  <div className="mt-3 space-y-3">
                    {pendingQuestions.map((question: any) => {
                      const draft = reviewDrafts[attempt.id]?.[question.questionId] || {
                        pointsAwarded: "",
                        note: "",
                      };
                      return (
                        <div key={question.questionId} className="rounded-xl border p-3">
                          <p className="whitespace-pre-wrap text-sm">{question.answerText || "—"}</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-[120px_1fr]">
                            <input
                              type="number"
                              min={0}
                              max={question.pointsPossible}
                              step="0.5"
                              placeholder={`${copy.points} / ${question.pointsPossible}`}
                              value={draft.pointsAwarded}
                              onChange={(event) => setReviewDrafts((current: any) => ({
                                ...current,
                                [attempt.id]: {
                                  ...(current[attempt.id] || {}),
                                  [question.questionId]: {
                                    ...draft,
                                    pointsAwarded: event.target.value,
                                  },
                                },
                              }))}
                              className="rounded-xl border bg-transparent px-3 py-2"
                            />
                            <input
                              value={draft.note}
                              onChange={(event) => setReviewDrafts((current: any) => ({
                                ...current,
                                [attempt.id]: {
                                  ...(current[attempt.id] || {}),
                                  [question.questionId]: {
                                    ...draft,
                                    note: event.target.value,
                                  },
                                },
                              }))}
                              placeholder={copy.note}
                              className="rounded-xl border bg-transparent px-3 py-2"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={working || !writesEnabled}
                    onClick={() => {
                      const reviews = Object.fromEntries(
                        pendingQuestions.map((question: any) => {
                          const draft = reviewDrafts[attempt.id]?.[question.questionId] || {};
                          return [
                            question.questionId,
                            {
                              pointsAwarded: Number(draft.pointsAwarded),
                              note: draft.note || "",
                            },
                          ];
                        }),
                      );
                      void action({
                        action: "review_assessment",
                        assessmentAttemptId: attempt.id,
                        reviews,
                      });
                    }}
                    className="mt-3 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    {copy.saveReview}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-3xl border p-5 shadow-sm">
        <h3 className="font-semibold">{copy.verifiedResults}</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(state.verifiedResults || []).map((row: any) => {
            const staffName =
              staff.find((staffRow: any) => String(staffRow.id) === String(row.staff_user_id))?.full_name
              || row.staff_user_id;
            const score = scoreFromResult(row);
            return (
              <div key={row.id} className="rounded-2xl border p-3">
                <p className="font-semibold">{staffName}</p>
                <p className="mt-1 text-sm">{score === null ? "—" : `${score}%`}</p>
                <p className="text-xs opacity-55">{formatDate(row.verified_at)}</p>
              </div>
            );
          })}
        </div>
      </section>

      {state.identity?.staffUserRole === "hotel_manager" ? (
        <StaffHrRulesPanel
          lang={lang}
          writesEnabled={writesEnabled}
          staff={staff}
          standards={state.standards || []}
          hrRules={state.hrRules || []}
          hrEvaluations={state.hrEvaluations || []}
          action={action}
        />
      ) : null}
    </div>
  );
}
