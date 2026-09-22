"use client";

import { useMemo, useState } from "react";

type UiLang = "bg" | "en" | "de";

type StaffRow = {
  id: string;
  full_name?: string | null;
  role?: string;
};

type StandardRow = {
  id: string;
  standard_key: string;
  revision_no: number;
  standard_hash: string;
};

type HrRuleRevision = {
  id: string;
  rule_set_key: string;
  revision_no: number;
  rule_set_hash: string;
  rules_json?: Record<string, any>;
};

type HrEvaluation = {
  id: string;
  staff_user_id: string;
  hr_rule_revision_id: string;
  evaluation_hash: string;
  evaluation_json?: Record<string, any>;
  evaluated_at: string;
};

type RuleType =
  | "latest_score_below"
  | "failed_results_at_least"
  | "required_standard_not_passed";

type RuleAction =
  | "manager_review"
  | "retraining_required"
  | "supervisor_followup"
  | "recertification_required"
  | "no_action";

type RuleSeverity = "info" | "warning" | "critical";

type RuleDraft = {
  id: string;
  type: RuleType;
  threshold: number;
  action: RuleAction;
  severity: RuleSeverity;
  standardHash: string;
};

const COPY = {
  bg: {
    title: "HR правила и Manager анализ",
    intro: "Правилата работят само върху verified резултати. Те могат да предложат повторно обучение, повторна сертификация или Manager review, но не могат автоматично да вземат HR решение.",
    rules: "Правила",
    key: "Ключ на правилата",
    add: "Добави правило",
    latestScore: "Последен резултат под",
    failedCount: "Брой неиздържани поне",
    requiredStandard: "Задължителен стандарт не е издържан",
    threshold: "Праг",
    action: "Действие",
    severity: "Ниво",
    allStandards: "Всички стандарти",
    standard: "Стандарт",
    managerReview: "Manager review",
    retraining: "Повторно обучение",
    supervisor: "Supervisor follow-up",
    recertification: "Повторна сертификация",
    noAction: "Без действие",
    info: "Инфо",
    warning: "Внимание",
    critical: "Критично",
    remove: "Премахни",
    publish: "Публикувай HR правила",
    evaluate: "Преизчисли за служител",
    staff: "Служител",
    ruleVersion: "Версия на правилата",
    findings: "Резултати от правилата",
    noFindings: "Няма задействани правила.",
    humanDecision: "Всички HR решения остават при Hotel Manager. AI може да обобщава и обяснява, но няма decision authority.",
    locked: "Записването е заключено до финалния E2E тест.",
    saved: "HR правилата са публикувани.",
    evaluated: "HR evaluation е записан.",
  },
  en: {
    title: "HR Rules & Manager Analysis",
    intro: "Rules operate only on verified results. They may suggest retraining, recertification or Manager review, but cannot make an employment decision automatically.",
    rules: "Rules",
    key: "Rule set key",
    add: "Add rule",
    latestScore: "Latest score below",
    failedCount: "Failed results at least",
    requiredStandard: "Required standard not passed",
    threshold: "Threshold",
    action: "Action",
    severity: "Level",
    allStandards: "All standards",
    standard: "Standard",
    managerReview: "Manager review",
    retraining: "Retraining required",
    supervisor: "Supervisor follow-up",
    recertification: "Recertification required",
    noAction: "No action",
    info: "Info",
    warning: "Warning",
    critical: "Critical",
    remove: "Remove",
    publish: "Publish HR rules",
    evaluate: "Evaluate employee",
    staff: "Employee",
    ruleVersion: "Rule version",
    findings: "Rule findings",
    noFindings: "No rules triggered.",
    humanDecision: "All HR decisions remain with the Hotel Manager. AI may summarize and explain, but has no decision authority.",
    locked: "Writes are locked until the final E2E test.",
    saved: "HR rules published.",
    evaluated: "HR evaluation saved.",
  },
  de: {
    title: "HR-Regeln & Manager-Analyse",
    intro: "Regeln arbeiten nur mit verifizierten Ergebnissen. Sie können Nachschulung, Rezertifizierung oder Manager-Prüfung vorschlagen, aber keine Personalentscheidung automatisch treffen.",
    rules: "Regeln",
    key: "Regelwerk-Schlüssel",
    add: "Regel hinzufügen",
    latestScore: "Letztes Ergebnis unter",
    failedCount: "Mindestens so viele nicht bestanden",
    requiredStandard: "Pflichtstandard nicht bestanden",
    threshold: "Schwelle",
    action: "Aktion",
    severity: "Stufe",
    allStandards: "Alle Standards",
    standard: "Standard",
    managerReview: "Manager-Prüfung",
    retraining: "Nachschulung",
    supervisor: "Supervisor-Follow-up",
    recertification: "Rezertifizierung",
    noAction: "Keine Aktion",
    info: "Info",
    warning: "Warnung",
    critical: "Kritisch",
    remove: "Entfernen",
    publish: "HR-Regeln veröffentlichen",
    evaluate: "Mitarbeiter auswerten",
    staff: "Mitarbeiter",
    ruleVersion: "Regelversion",
    findings: "Regelbefunde",
    noFindings: "Keine Regel ausgelöst.",
    humanDecision: "Alle Personalentscheidungen bleiben beim Hotel Manager. KI darf zusammenfassen und erklären, hat aber keine Entscheidungsbefugnis.",
    locked: "Schreibzugriffe bleiben bis zum finalen E2E-Test gesperrt.",
    saved: "HR-Regeln veröffentlicht.",
    evaluated: "HR-Auswertung gespeichert.",
  },
} as const;

function blankRule(index: number): RuleDraft {
  return {
    id: `rule-${index}`,
    type: "latest_score_below",
    threshold: 80,
    action: "retraining_required",
    severity: "warning",
    standardHash: "",
  };
}

function actionLabel(action: string, copy: typeof COPY.bg) {
  if (action === "retraining_required") return copy.retraining;
  if (action === "recertification_required") return copy.recertification;
  if (action === "supervisor_followup") return copy.supervisor;
  if (action === "no_action") return copy.noAction;
  return copy.managerReview;
}

export default function StaffHrRulesPanel({
  lang,
  writesEnabled,
  staff,
  standards,
  hrRules,
  hrEvaluations,
  action,
}: {
  lang: UiLang;
  writesEnabled: boolean;
  staff: StaffRow[];
  standards: StandardRow[];
  hrRules: HrRuleRevision[];
  hrEvaluations: HrEvaluation[];
  action: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const copy = COPY[lang] || COPY.bg;
  const [ruleSetKey, setRuleSetKey] = useState("staff-development-rules");
  const [rules, setRules] = useState<RuleDraft[]>([blankRule(1)]);
  const [staffUserId, setStaffUserId] = useState("");
  const [hrRuleRevisionId, setHrRuleRevisionId] = useState("");
  const [notice, setNotice] = useState("");

  const latestRules = useMemo(
    () =>
      [...hrRules].sort(
        (left, right) => Number(right.revision_no) - Number(left.revision_no),
      ),
    [hrRules],
  );

  async function publishRules() {
    const normalized = rules.map((rule, index) => ({
      id:
        rule.id
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, "-")
        || `rule-${index + 1}`,
      type: rule.type,
      action: rule.action,
      severity: rule.severity,
      ...(rule.type !== "required_standard_not_passed"
        ? { threshold: Number(rule.threshold) }
        : {}),
      ...(rule.standardHash ? { standardHash: rule.standardHash } : {}),
    }));

    const result = await action({
      action: "publish_hr_rules",
      ruleSet: {
        ruleSetKey,
        rules: normalized,
      },
    });
    if (result) setNotice(copy.saved);
  }

  async function evaluate() {
    const result = await action({
      action: "evaluate_hr_rules",
      targetStaffUserId: staffUserId,
      hrRuleRevisionId,
    });
    if (result) setNotice(copy.evaluated);
  }

  function updateRule(index: number, patch: Partial<RuleDraft>) {
    setRules((current) =>
      current.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule,
      ),
    );
  }

  return (
    <section className="rounded-3xl border p-5 shadow-sm" data-staff-hr-rules="true">
      <h3 className="text-lg font-semibold">{copy.title}</h3>
      <p className="mt-1 max-w-4xl text-sm opacity-65">{copy.intro}</p>

      {!writesEnabled ? (
        <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm">
          {copy.locked}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm">
          {notice}
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-semibold">{copy.rules}</h4>
          <button
            type="button"
            onClick={() => setRules((current) => [...current, blankRule(current.length + 1)])}
            className="rounded-xl border px-3 py-2 text-sm font-semibold"
          >
            {copy.add}
          </button>
        </div>

        <input
          value={ruleSetKey}
          onChange={(event) => setRuleSetKey(event.target.value)}
          placeholder={copy.key}
          className="mt-3 w-full rounded-xl border bg-transparent px-3 py-2 text-sm"
        />

        <div className="mt-3 space-y-3">
          {rules.map((rule, index) => (
            <div key={`${rule.id}-${index}`} className="rounded-2xl border p-3">
              <div className="grid gap-2 lg:grid-cols-[160px_1.2fr_120px_1fr_130px_auto]">
                <input
                  value={rule.id}
                  onChange={(event) => updateRule(index, { id: event.target.value })}
                  className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                />
                <select
                  value={rule.type}
                  onChange={(event) => updateRule(index, {
                    type: event.target.value as RuleType,
                  })}
                  className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                >
                  <option value="latest_score_below">{copy.latestScore}</option>
                  <option value="failed_results_at_least">{copy.failedCount}</option>
                  <option value="required_standard_not_passed">{copy.requiredStandard}</option>
                </select>
                <input
                  type="number"
                  min={rule.type === "failed_results_at_least" ? 1 : 0}
                  max={100}
                  disabled={rule.type === "required_standard_not_passed"}
                  value={rule.threshold}
                  onChange={(event) => updateRule(index, {
                    threshold: Number(event.target.value),
                  })}
                  className="rounded-xl border bg-transparent px-3 py-2 text-sm disabled:opacity-40"
                  title={copy.threshold}
                />
                <select
                  value={rule.standardHash}
                  onChange={(event) => updateRule(index, {
                    standardHash: event.target.value,
                  })}
                  className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                >
                  <option value="">{copy.allStandards}</option>
                  {standards.map((standard) => (
                    <option key={standard.id} value={standard.standard_hash}>
                      {standard.standard_key} · v{standard.revision_no}
                    </option>
                  ))}
                </select>
                <select
                  value={rule.action}
                  onChange={(event) => updateRule(index, {
                    action: event.target.value as RuleAction,
                  })}
                  className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                >
                  <option value="manager_review">{copy.managerReview}</option>
                  <option value="retraining_required">{copy.retraining}</option>
                  <option value="supervisor_followup">{copy.supervisor}</option>
                  <option value="recertification_required">{copy.recertification}</option>
                  <option value="no_action">{copy.noAction}</option>
                </select>
                <button
                  type="button"
                  disabled={rules.length <= 1}
                  onClick={() => setRules((current) =>
                    current.filter((_, ruleIndex) => ruleIndex !== index)
                  )}
                  className="rounded-xl border px-3 py-2 text-sm disabled:opacity-30"
                >
                  {copy.remove}
                </button>
              </div>

              <select
                value={rule.severity}
                onChange={(event) => updateRule(index, {
                  severity: event.target.value as RuleSeverity,
                })}
                className="mt-2 rounded-xl border bg-transparent px-3 py-2 text-sm"
              >
                <option value="info">{copy.info}</option>
                <option value="warning">{copy.warning}</option>
                <option value="critical">{copy.critical}</option>
              </select>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={
            !writesEnabled
            || !ruleSetKey.trim()
            || rules.some((rule) =>
              rule.type === "required_standard_not_passed"
              && !rule.standardHash
            )
          }
          onClick={() => void publishRules()}
          className="mt-4 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          {copy.publish}
        </button>
      </div>

      <div className="mt-4 rounded-2xl border p-4">
        <h4 className="font-semibold">{copy.evaluate}</h4>
        <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_1fr_auto]">
          <select
            value={staffUserId}
            onChange={(event) => setStaffUserId(event.target.value)}
            className="rounded-xl border bg-transparent px-3 py-2 text-sm"
          >
            <option value="">{copy.staff}</option>
            {staff.map((row) => (
              <option key={row.id} value={row.id}>
                {row.full_name || row.id}
              </option>
            ))}
          </select>
          <select
            value={hrRuleRevisionId}
            onChange={(event) => setHrRuleRevisionId(event.target.value)}
            className="rounded-xl border bg-transparent px-3 py-2 text-sm"
          >
            <option value="">{copy.ruleVersion}</option>
            {latestRules.map((row) => (
              <option key={row.id} value={row.id}>
                {row.rule_set_key} · v{row.revision_no}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!writesEnabled || !staffUserId || !hrRuleRevisionId}
            onClick={() => void evaluate()}
            className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {copy.evaluate}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border p-4">
        <h4 className="font-semibold">{copy.findings}</h4>
        <p className="mt-1 text-xs opacity-55">{copy.humanDecision}</p>
        <div className="mt-3 space-y-2">
          {!hrEvaluations.length ? (
            <p className="text-sm opacity-60">{copy.noFindings}</p>
          ) : null}
          {hrEvaluations.map((evaluation) => {
            const staffName =
              staff.find((row) => row.id === evaluation.staff_user_id)?.full_name
              || evaluation.staff_user_id;
            const findings = Array.isArray(evaluation.evaluation_json?.findings)
              ? evaluation.evaluation_json?.findings
              : [];

            return (
              <div key={evaluation.id} className="rounded-xl border p-3">
                <p className="font-semibold">{staffName}</p>
                <p className="mt-1 text-xs opacity-55">
                  {new Date(evaluation.evaluated_at).toLocaleString()}
                </p>
                <div className="mt-2 space-y-1">
                  {!findings.length ? (
                    <p className="text-sm opacity-60">{copy.noFindings}</p>
                  ) : findings.map((finding: any) => (
                    <p key={finding.ruleId} className="text-sm">
                      <strong>{actionLabel(finding.action, copy as any)}</strong>
                      {" · "}{finding.reason}
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
