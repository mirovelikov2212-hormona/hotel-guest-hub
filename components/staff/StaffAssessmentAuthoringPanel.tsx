"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UiLang = "bg" | "en" | "de";
type ContentLang = "bg" | "en" | "de" | "ro" | "cs" | "ru";
type QuestionType = "single_choice" | "scenario_choice" | "free_text";

type Localized = Partial<Record<ContentLang, string>>;

type ChoiceOption = {
  id: string;
  textByLang: Localized;
};

type QuestionDraft = {
  id: string;
  type: QuestionType;
  promptByLang: Localized;
  scenarioByLang?: Localized;
  sourceUnitIds: string[];
  points: number;
  options?: ChoiceOption[];
  correctOptionId?: string;
};

type Proposal = {
  minimumPassScore: number;
  questions: QuestionDraft[];
};

type TrainingPlanRow = {
  id: string;
  training_plan_hash?: string;
  plan_json?: {
    sourceStandardKey?: string;
    standardScope?: "hotel" | "department";
    departmentCodes?: string[];
    units?: Array<{
      unitId: string;
      titleByLang?: Localized;
      bodyByLang?: Localized;
    }>;
  };
};

type AuthoringRow = {
  id: string;
  training_plan_revision_id: string;
  status: "draft" | "proposal_ready" | "published" | "cancelled";
  assessment_key: string;
  structured_proposal_json: Record<string, any> | null;
  proposal_hash: string | null;
  published_assessment_revision_id: string | null;
  updated_at: string;
};

const LANGUAGES: Array<{ id: ContentLang; label: string }> = [
  { id: "bg", label: "BG" },
  { id: "en", label: "EN" },
  { id: "de", label: "DE" },
  { id: "ro", label: "RO" },
  { id: "cs", label: "CZ" },
  { id: "ru", label: "RU" },
];

const COPY = {
  bg: {
    title: "Тестове към обучението",
    intro: "Тестът е вързан към конкретен Training Plan. Въпросите могат по-късно да бъдат предложени от AI, но Manager вижда, редактира и одобрява въпросите и верните отговори преди публикуване.",
    new: "Нов тест",
    plan: "Обучение",
    key: "Ключ на теста",
    create: "Създай чернова",
    drafts: "Чернови и версии",
    noDrafts: "Все още няма тестове в authoring.",
    status: "Статус",
    draft: "Чернова",
    proposalReady: "Готово за преглед",
    published: "Публикувано",
    proposal: "Въпроси",
    language: "Език за редакция",
    passScore: "Минимален резултат %",
    addChoice: "Добави въпрос",
    addScenario: "Добави сценарий",
    addFreeText: "Добави свободен отговор",
    questionId: "ID на въпроса",
    prompt: "Въпрос",
    scenario: "Ситуация / сценарий",
    sourceUnit: "Тема от обучението",
    points: "Точки",
    option: "Отговор",
    correct: "Верен",
    addOption: "Добави отговор",
    remove: "Премахни",
    save: "Запази предложение",
    publish: "Одобри и публикувай",
    approval: "Publish създава immutable версия на теста. Проверете въпросите, верните отговори и точките.",
    locked: "Записването е заключено до финалния E2E тест.",
    saved: "Запазено.",
    publishedNotice: "Тестът е публикуван.",
  },
  en: {
    title: "Training Assessments",
    intro: "The assessment is bound to a specific Training Plan. AI may propose questions later, but the Manager sees, edits and approves questions and correct answers before publishing.",
    new: "New assessment",
    plan: "Training plan",
    key: "Assessment key",
    create: "Create draft",
    drafts: "Drafts and versions",
    noDrafts: "No assessments in authoring yet.",
    status: "Status",
    draft: "Draft",
    proposalReady: "Ready for review",
    published: "Published",
    proposal: "Questions",
    language: "Editing language",
    passScore: "Minimum pass score %",
    addChoice: "Add question",
    addScenario: "Add scenario",
    addFreeText: "Add free-text question",
    questionId: "Question ID",
    prompt: "Question",
    scenario: "Situation / scenario",
    sourceUnit: "Training unit",
    points: "Points",
    option: "Answer",
    correct: "Correct",
    addOption: "Add answer",
    remove: "Remove",
    save: "Save proposal",
    publish: "Approve and publish",
    approval: "Publish creates an immutable assessment version. Review questions, correct answers and points.",
    locked: "Writes are locked until the final E2E test.",
    saved: "Saved.",
    publishedNotice: "Assessment published.",
  },
  de: {
    title: "Tests zur Schulung",
    intro: "Der Test ist an einen konkreten Training Plan gebunden. KI kann später Fragen vorschlagen, aber der Manager sieht, bearbeitet und genehmigt Fragen und richtige Antworten vor der Veröffentlichung.",
    new: "Neuer Test",
    plan: "Schulung",
    key: "Test-Schlüssel",
    create: "Entwurf erstellen",
    drafts: "Entwürfe und Versionen",
    noDrafts: "Noch keine Tests im Authoring.",
    status: "Status",
    draft: "Entwurf",
    proposalReady: "Zur Prüfung bereit",
    published: "Veröffentlicht",
    proposal: "Fragen",
    language: "Bearbeitungssprache",
    passScore: "Mindestpunktzahl %",
    addChoice: "Frage hinzufügen",
    addScenario: "Szenario hinzufügen",
    addFreeText: "Freitext-Frage hinzufügen",
    questionId: "Frage-ID",
    prompt: "Frage",
    scenario: "Situation / Szenario",
    sourceUnit: "Lerneinheit",
    points: "Punkte",
    option: "Antwort",
    correct: "Richtig",
    addOption: "Antwort hinzufügen",
    remove: "Entfernen",
    save: "Vorschlag speichern",
    publish: "Freigeben und veröffentlichen",
    approval: "Publish erstellt eine unveränderliche Test-Version. Fragen, richtige Antworten und Punkte müssen geprüft werden.",
    locked: "Schreibzugriffe bleiben bis zum finalen E2E-Test gesperrt.",
    saved: "Gespeichert.",
    publishedNotice: "Test veröffentlicht.",
  },
} as const;

function cleanId(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function blankQuestion(
  type: QuestionType,
  index: number,
  sourceUnitId: string,
): QuestionDraft {
  if (type === "free_text") {
    return {
      id: `question-${index}`,
      type,
      promptByLang: {},
      sourceUnitIds: sourceUnitId ? [sourceUnitId] : [],
      points: 10,
    };
  }

  return {
    id: `question-${index}`,
    type,
    promptByLang: {},
    ...(type === "scenario_choice" ? { scenarioByLang: {} } : {}),
    sourceUnitIds: sourceUnitId ? [sourceUnitId] : [],
    points: 10,
    options: [
      { id: "option-a", textByLang: {} },
      { id: "option-b", textByLang: {} },
    ],
    correctOptionId: "option-a",
  };
}

function statusLabel(row: AuthoringRow, copy: typeof COPY.bg) {
  if (row.status === "published") return copy.published;
  if (row.status === "proposal_ready") return copy.proposalReady;
  return copy.draft;
}

function displayLocalized(value: Localized | undefined, lang: ContentLang) {
  if (!value) return "";
  return (
    value[lang]
    || value.en
    || value.bg
    || Object.values(value).find(Boolean)
    || ""
  );
}

function planScopeLabel(plan: TrainingPlanRow) {
  if (plan.plan_json?.standardScope === "hotel") return "Hotel";
  const department = plan.plan_json?.departmentCodes?.[0];
  return department ? `Department: ${department}` : "Department";
}

export default function StaffAssessmentAuthoringPanel({
  hotelSlug,
  lang,
  writesEnabled,
  trainingPlans,
}: {
  hotelSlug: string;
  lang: UiLang;
  writesEnabled: boolean;
  trainingPlans: TrainingPlanRow[];
}) {
  const copy = COPY[lang] || COPY.bg;
  const [rows, setRows] = useState<AuthoringRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [planId, setPlanId] = useState("");
  const [newKey, setNewKey] = useState("");
  const [editLanguage, setEditLanguage] = useState<ContentLang>("bg");
  const [proposal, setProposal] = useState<Proposal>({
    minimumPassScore: 80,
    questions: [],
  });
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || null,
    [rows, selectedId],
  );

  const selectedPlan = useMemo(() => {
    const id = selected?.training_plan_revision_id || planId;
    return trainingPlans.find((row) => String(row.id) === String(id)) || null;
  }, [selected?.training_plan_revision_id, planId, trainingPlans]);

  const units = selectedPlan?.plan_json?.units || [];
  const firstUnitId = units[0]?.unitId || "";

  const loadRows = useCallback(async () => {
    const response = await fetch(
      `/api/staff/development/assessments/authoring?hotelSlug=${encodeURIComponent(hotelSlug)}`,
      { cache: "no-store", credentials: "same-origin" },
    );
    const body = await response.json().catch(() => null) as any;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error || "STAFF_ASSESSMENT_AUTHORING_LIST_FAILED");
    }
    const next = (body.authoring || []) as AuthoringRow[];
    setRows(next);
    setSelectedId((current) => current || next[0]?.id || "");
    return next;
  }, [hotelSlug]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadRows()
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadRows]);

  useEffect(() => {
    if (!selected?.structured_proposal_json) {
      setProposal({ minimumPassScore: 80, questions: [] });
      return;
    }

    const stored = selected.structured_proposal_json;
    setProposal({
      minimumPassScore: Number(stored.minimumPassScore ?? 80),
      questions: Array.isArray(stored.questions)
        ? stored.questions.map((question: any) => ({
            id: String(question.id || ""),
            type: question.type as QuestionType,
            promptByLang: question.promptByLang || {},
            scenarioByLang: question.scenarioByLang || undefined,
            sourceUnitIds: Array.isArray(question.sourceUnitIds)
              ? question.sourceUnitIds.map(String)
              : [],
            points: Number(question.points || 1),
            options: Array.isArray(question.options)
              ? question.options.map((option: any) => ({
                  id: String(option.id || ""),
                  textByLang: option.textByLang || {},
                }))
              : undefined,
            correctOptionId: question.correctOptionId
              ? String(question.correctOptionId)
              : undefined,
          }))
        : [],
    });
  }, [selectedId, selected?.updated_at]);

  async function post(payload: Record<string, unknown>) {
    const response = await fetch(
      "/api/staff/development/assessments/authoring",
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelSlug, ...payload }),
      },
    );
    const body = await response.json().catch(() => null) as any;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error || "STAFF_ASSESSMENT_AUTHORING_FAILED");
    }
    return body.result;
  }

  async function createDraft() {
    if (!writesEnabled) {
      setError(copy.locked);
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await post({
        action: "create_draft",
        trainingPlanRevisionId: planId,
        assessmentKey: newKey,
      });
      setNewKey("");
      await loadRows();
      setSelectedId(String(result.id));
      setNotice(copy.saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  }

  function addQuestion(type: QuestionType) {
    setProposal((current) => ({
      ...current,
      questions: [
        ...current.questions,
        blankQuestion(type, current.questions.length + 1, firstUnitId),
      ],
    }));
  }

  function updateQuestion(
    index: number,
    mutator: (question: QuestionDraft) => QuestionDraft,
  ) {
    setProposal((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index
          ? mutator(structuredClone(question))
          : question,
      ),
    }));
  }

  function addOption(questionIndex: number) {
    updateQuestion(questionIndex, (question) => {
      const options = question.options || [];
      const nextId = `option-${options.length + 1}`;
      return {
        ...question,
        options: [...options, { id: nextId, textByLang: {} }],
        correctOptionId: question.correctOptionId || nextId,
      };
    });
  }

  async function saveProposal() {
    if (!selected) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const questions = proposal.questions.map((question, questionIndex) => {
        const id = cleanId(question.id, `question-${questionIndex + 1}`);
        if (question.type === "free_text") {
          return {
            id,
            type: question.type,
            promptByLang: question.promptByLang,
            sourceUnitIds: question.sourceUnitIds,
            points: question.points,
          };
        }

        const options = (question.options || []).map((option, optionIndex) => ({
          id: cleanId(option.id, `option-${optionIndex + 1}`),
          textByLang: option.textByLang,
        }));
        const optionIds = options.map((option) => option.id);
        const currentCorrect = cleanId(
          question.correctOptionId || "",
          options[0]?.id || "option-1",
        );
        const correctOptionId = optionIds.includes(currentCorrect)
          ? currentCorrect
          : options[0]?.id;

        return {
          id,
          type: question.type,
          promptByLang: question.promptByLang,
          ...(question.type === "scenario_choice"
            ? { scenarioByLang: question.scenarioByLang || {} }
            : {}),
          sourceUnitIds: question.sourceUnitIds,
          points: question.points,
          options,
          correctOptionId,
        };
      });

      await post({
        action: "save_proposal",
        authoringId: selected.id,
        proposal: {
          minimumPassScore: proposal.minimumPassScore,
          questions,
        },
      });
      await loadRows();
      setNotice(copy.saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  }

  async function publish() {
    if (!selected || selected.status !== "proposal_ready") return;
    if (!window.confirm(copy.approval)) return;

    setWorking(true);
    setError("");
    setNotice("");
    try {
      await post({
        action: "publish",
        authoringId: selected.id,
      });
      await loadRows();
      setNotice(copy.publishedNotice);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="rounded-3xl border p-5 shadow-sm" data-staff-assessment-authoring="true">
      <h3 className="text-lg font-semibold">{copy.title}</h3>
      <p className="mt-1 max-w-4xl text-sm opacity-65">{copy.intro}</p>

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
      {notice ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm">
          {notice}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.5fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border p-4">
            <h4 className="font-semibold">{copy.new}</h4>
            <select
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
              className="mt-3 w-full rounded-xl border bg-transparent px-3 py-2 text-sm"
            >
              <option value="">{copy.plan}</option>
              {trainingPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.plan_json?.sourceStandardKey || plan.training_plan_hash?.slice(0, 12) || plan.id} · {planScopeLabel(plan)}
                </option>
              ))}
            </select>
            <input
              value={newKey}
              onChange={(event) => setNewKey(event.target.value)}
              placeholder="housekeeping-room-entry-test"
              className="mt-2 w-full rounded-xl border bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={working || !writesEnabled || !planId || !newKey.trim()}
              onClick={() => void createDraft()}
              className="mt-3 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              {copy.create}
            </button>
          </div>

          <div className="rounded-2xl border p-4">
            <h4 className="font-semibold">{copy.drafts}</h4>
            {loading ? <p className="mt-2 text-sm opacity-60">…</p> : null}
            {!loading && !rows.length ? (
              <p className="mt-2 text-sm opacity-60">{copy.noDrafts}</p>
            ) : null}
            <div className="mt-3 space-y-2">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full rounded-xl border p-3 text-left ${selectedId === row.id ? "bg-black/10" : ""}`}
                >
                  <p className="font-semibold">{row.assessment_key}</p>
                  <p className="mt-1 text-xs opacity-55">
                    {statusLabel(row, copy as any)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {selected ? (
          <div className="rounded-2xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold">
                  {selected.assessment_key}
                </h4>
                <p className="mt-1 text-xs opacity-55">
                  {copy.status}: {statusLabel(selected, copy as any)}
                </p>
              </div>
              <div className="flex gap-2">
                <select
                  value={editLanguage}
                  onChange={(event) => setEditLanguage(event.target.value as ContentLang)}
                  className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                >
                  {LANGUAGES.map((language) => (
                    <option key={language.id} value={language.id}>
                      {language.label}
                    </option>
                  ))}
                </select>
                {selected.status === "proposal_ready" ? (
                  <button
                    type="button"
                    disabled={working || !writesEnabled}
                    onClick={() => void publish()}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    {copy.publish}
                  </button>
                ) : null}
              </div>
            </div>

            {selectedPlan ? (
              <div className="mt-3 rounded-xl border p-3 text-sm">
                <strong>{copy.plan}:</strong>{" "}
                {selectedPlan.plan_json?.sourceStandardKey || selectedPlan.id} · {planScopeLabel(selectedPlan)}
                <div className="mt-1 text-xs opacity-55">
                  {(units || [])
                    .map((unit) => displayLocalized(unit.titleByLang, editLanguage) || unit.unitId)
                    .join(" · ")}
                </div>
              </div>
            ) : null}

            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-semibold opacity-60">{copy.passScore}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={proposal.minimumPassScore}
                onChange={(event) => setProposal((current) => ({
                  ...current,
                  minimumPassScore: Number(event.target.value),
                }))}
                className="w-40 rounded-xl border bg-transparent px-3 py-2"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addQuestion("single_choice")}
                className="rounded-xl border px-3 py-2 text-sm font-semibold"
              >
                {copy.addChoice}
              </button>
              <button
                type="button"
                onClick={() => addQuestion("scenario_choice")}
                className="rounded-xl border px-3 py-2 text-sm font-semibold"
              >
                {copy.addScenario}
              </button>
              <button
                type="button"
                onClick={() => addQuestion("free_text")}
                className="rounded-xl border px-3 py-2 text-sm font-semibold"
              >
                {copy.addFreeText}
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {proposal.questions.map((question, questionIndex) => (
                <div key={`${question.id}-${questionIndex}`} className="rounded-2xl border p-4">
                  <div className="grid gap-2 sm:grid-cols-[1fr_180px_100px_auto]">
                    <input
                      value={question.id}
                      onChange={(event) => updateQuestion(questionIndex, (current) => ({
                        ...current,
                        id: event.target.value,
                      }))}
                      placeholder={copy.questionId}
                      className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                    />
                    <select
                      value={question.sourceUnitIds[0] || ""}
                      onChange={(event) => updateQuestion(questionIndex, (current) => ({
                        ...current,
                        sourceUnitIds: event.target.value ? [event.target.value] : [],
                      }))}
                      className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                    >
                      <option value="">{copy.sourceUnit}</option>
                      {units.map((unit) => (
                        <option key={unit.unitId} value={unit.unitId}>
                          {displayLocalized(unit.titleByLang, editLanguage) || unit.unitId}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={question.points}
                      onChange={(event) => updateQuestion(questionIndex, (current) => ({
                        ...current,
                        points: Number(event.target.value),
                      }))}
                      className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                      title={copy.points}
                    />
                    <button
                      type="button"
                      onClick={() => setProposal((current) => ({
                        ...current,
                        questions: current.questions.filter((_, index) => index !== questionIndex),
                      }))}
                      className="rounded-xl border px-3 py-2 text-sm"
                    >
                      {copy.remove}
                    </button>
                  </div>

                  {question.type === "scenario_choice" ? (
                    <textarea
                      value={question.scenarioByLang?.[editLanguage] || ""}
                      onChange={(event) => updateQuestion(questionIndex, (current) => ({
                        ...current,
                        scenarioByLang: {
                          ...(current.scenarioByLang || {}),
                          [editLanguage]: event.target.value,
                        },
                      }))}
                      placeholder={copy.scenario}
                      className="mt-2 min-h-20 w-full rounded-xl border bg-transparent p-3 text-sm"
                    />
                  ) : null}

                  <textarea
                    value={question.promptByLang[editLanguage] || ""}
                    onChange={(event) => updateQuestion(questionIndex, (current) => ({
                      ...current,
                      promptByLang: {
                        ...current.promptByLang,
                        [editLanguage]: event.target.value,
                      },
                    }))}
                    placeholder={copy.prompt}
                    className="mt-2 min-h-20 w-full rounded-xl border bg-transparent p-3 text-sm"
                  />

                  {question.type !== "free_text" ? (
                    <div className="mt-3 space-y-2">
                      {(question.options || []).map((option, optionIndex) => (
                        <div
                          key={`${option.id}-${optionIndex}`}
                          className="grid gap-2 sm:grid-cols-[120px_1fr_80px_auto]"
                        >
                          <input
                            value={option.id}
                            onChange={(event) => updateQuestion(questionIndex, (current) => {
                              const options = [...(current.options || [])];
                              options[optionIndex] = {
                                ...options[optionIndex],
                                id: event.target.value,
                              };
                              return { ...current, options };
                            })}
                            className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                          />
                          <input
                            value={option.textByLang[editLanguage] || ""}
                            onChange={(event) => updateQuestion(questionIndex, (current) => {
                              const options = [...(current.options || [])];
                              options[optionIndex] = {
                                ...options[optionIndex],
                                textByLang: {
                                  ...options[optionIndex].textByLang,
                                  [editLanguage]: event.target.value,
                                },
                              };
                              return { ...current, options };
                            })}
                            placeholder={copy.option}
                            className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                          />
                          <label className="flex items-center justify-center gap-2 text-xs">
                            <input
                              type="radio"
                              name={`correct-${selected.id}-${questionIndex}`}
                              checked={question.correctOptionId === option.id}
                              onChange={() => updateQuestion(questionIndex, (current) => ({
                                ...current,
                                correctOptionId: option.id,
                              }))}
                            />
                            {copy.correct}
                          </label>
                          <button
                            type="button"
                            disabled={(question.options || []).length <= 2}
                            onClick={() => updateQuestion(questionIndex, (current) => ({
                              ...current,
                              options: (current.options || []).filter((_, index) => index !== optionIndex),
                              correctOptionId:
                                current.correctOptionId === option.id
                                  ? (current.options || []).filter((_, index) => index !== optionIndex)[0]?.id
                                  : current.correctOptionId,
                            }))}
                            className="rounded-xl border px-2 py-2 text-xs disabled:opacity-30"
                          >
                            {copy.remove}
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addOption(questionIndex)}
                        className="rounded-xl border px-3 py-2 text-xs font-semibold"
                      >
                        {copy.addOption}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={
                working
                || !writesEnabled
                || selected.status === "published"
                || !proposal.questions.length
              }
              onClick={() => void saveProposal()}
              className="mt-4 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              {copy.save}
            </button>

            <p className="mt-3 text-xs opacity-55">{copy.approval}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
