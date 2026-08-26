"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { FactoryRunProgress } from "@/lib/server/factory-onboarding-progress";

type Stage = "core" | "operational" | "envelope" | "native_content" | "communications";

const COPY = {
  bg: {
    title: "Product Factory прогрес",
    subtitle: "Всяка стъпка е отделна audited транзакция. След успех workspace-ът презарежда immutable lineage от базата.",
    foundation: "1. Foundation",
    core: "2. Core resources",
    operational: "3. Operational resources",
    envelope: "4. Onboarding envelope",
    native: "5. Native content & venues",
    communications: "6. Communications",
    complete: "ЗАВЪРШЕНО",
    ready: "ГОТОВО ЗА СТАРТ",
    waiting: "ИЗЧАКВА ПРЕДИШНАТА СТЪПКА",
    runCore: "Проектирай стаи и отдели",
    runOperational: "Проектирай услуги, workflows и routing",
    runEnvelope: "Създай fail-closed onboarding envelope",
    runNative: "Проектирай native съдържание и обекти",
    runCommunications: "Проектирай guest комуникации",
    running: "Изпълнение…",
    foundationText: "Draft Property и отделни Production/Sandbox identities са създадени. И двете среди трябва да останат неактивни.",
    coreText: "Създава normalized rooms и departments и нови draft revisions. Не активира runtime.",
    operationalText: "Създава services/workflows/integration placeholders и routing structures. Всички execution flags остават изключени.",
    envelopeText: "Създава disabled roles, reporting off, branding/knowledge placeholders, AI permissions off, reserved public identities и health pending.",
    nativeText: "Записва многоезична хотелска информация, Wi-Fi и venues в native Supabase authority. Knowledge lifecycle остава placeholder, а всички venues остават неактивни.",
    communicationsText: "Записва canonical guest-facing phone, WhatsApp и email към normalized departments за Production и Sandbox. Не променя отдели, работно време, routing или activation state.",
    next: "Следва: Sandbox certification",
    nextText: "Guided projection е завършен. Sandbox certification остава отделна explicit стъпка; Production остава неактивен.",
    failed: "Стъпката не можа да бъде завършена. Нищо след нея не е стартирано автоматично.",
    conflict: "Lineage вече е проектиран с различен hash или състоянието е променено. Презареди workspace-а и провери.",
    invalid: "Authoritative blueprint/lineage не премина Product Factory валидирането.",
    replayed: "Idempotent replay — върнат е съществуващият run.",
    prod: "Production",
    sandbox: "Sandbox",
    property: "Property",
    inactive: "INACTIVE",
    active: "ACTIVE",
    draft: "DRAFT",
    drift: "ВНИМАНИЕ: fail-closed foundation state е променен.",
    rooms: "стаи",
    departments: "отдели",
    services: "услуги",
    workflows: "workflows",
    integrations: "integrations",
    routing: "routing rules",
    roles: "role templates",
    infoItems: "инфо елемента",
    venues: "venues",
    configuredDepartments: "отдела с контакти",
    phone: "phone",
    whatsapp: "WhatsApp",
    email: "email",
  },
  en: {
    title: "Product Factory progress",
    subtitle: "Each step is a separate audited transaction. After success the workspace reloads immutable lineage from the database.",
    foundation: "1. Foundation",
    core: "2. Core resources",
    operational: "3. Operational resources",
    envelope: "4. Onboarding envelope",
    native: "5. Native content & venues",
    communications: "6. Communications",
    complete: "COMPLETED",
    ready: "READY TO RUN",
    waiting: "WAITING FOR PREVIOUS STEP",
    runCore: "Project rooms and departments",
    runOperational: "Project services, workflows and routing",
    runEnvelope: "Create fail-closed onboarding envelope",
    runNative: "Project native content and venues",
    runCommunications: "Project guest communications",
    running: "Running…",
    foundationText: "A draft Property and separate Production/Sandbox identities exist. Both environments must remain inactive.",
    coreText: "Creates normalized rooms and departments plus new draft revisions. Runtime is not activated.",
    operationalText: "Creates services/workflows/integration placeholders and routing structures. All execution flags remain disabled.",
    envelopeText: "Creates disabled roles, reporting off, branding/knowledge placeholders, AI permissions off, reserved public identities and pending health.",
    nativeText: "Persists multilingual hotel information, Wi-Fi and venues in native Supabase authority. Knowledge lifecycle stays placeholder and every venue remains inactive.",
    communicationsText: "Persists canonical guest-facing phone, WhatsApp and email on normalized departments for Production and Sandbox. Department identity, hours, routing and activation state are unchanged.",
    next: "Next: Sandbox certification",
    nextText: "Guided projection is complete. Sandbox certification remains a separate explicit step; Production stays inactive.",
    failed: "The stage could not be completed. No later stage was started automatically.",
    conflict: "The lineage was already projected with a different hash or state changed. Refresh the workspace and inspect it.",
    invalid: "The authoritative blueprint/lineage failed Product Factory validation.",
    replayed: "Idempotent replay — the existing run was returned.",
    prod: "Production",
    sandbox: "Sandbox",
    property: "Property",
    inactive: "INACTIVE",
    active: "ACTIVE",
    draft: "DRAFT",
    drift: "WARNING: fail-closed foundation state has changed.",
    rooms: "rooms",
    departments: "departments",
    services: "services",
    workflows: "workflows",
    integrations: "integrations",
    routing: "routing rules",
    roles: "role templates",
    infoItems: "info items",
    venues: "venues",
    configuredDepartments: "departments with contacts",
    phone: "phone",
    whatsapp: "WhatsApp",
    email: "email",
  },
} as const;

function statusTone(done: boolean, enabled: boolean) {
  if (done) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (enabled) return "border-cyan-400/25 bg-cyan-400/10 text-cyan-100";
  return "border-neutral-700 bg-neutral-950 text-neutral-500";
}

export default function FactoryProjectionWorkspace({
  lang,
  progress,
}: {
  lang: ControlPlaneLang;
  progress: FactoryRunProgress;
}) {
  const copy = COPY[lang];
  const router = useRouter();
  const [running, setRunning] = useState<Stage | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);

  const failClosed =
    progress.property.lifecycleState === "draft" &&
    progress.production.active === false &&
    progress.sandbox.active === false;

  async function runStage(stage: Stage) {
    if (running) return;
    setRunning(stage);
    setFeedback(null);
    setReplayed(false);

    const target =
      stage === "core"
        ? {
            url: "/api/control-plane/onboarding/core-resources",
            body: { onboardingRunId: progress.onboardingRunId, blueprint: progress.blueprint },
          }
        : stage === "operational"
          ? {
              url: "/api/control-plane/onboarding/operational-resources",
              body: { coreProjectionRunId: progress.core?.projectionRunId, blueprint: progress.blueprint },
            }
          : stage === "envelope"
            ? {
                url: "/api/control-plane/onboarding/envelope",
                body: { operationalProjectionRunId: progress.operational?.projectionRunId, blueprint: progress.blueprint },
              }
            : stage === "native_content"
              ? {
                  url: "/api/control-plane/onboarding/native-content-venues",
                  body: { operationalProjectionRunId: progress.operational?.projectionRunId, blueprint: progress.blueprint },
                }
              : {
                  url: "/api/control-plane/onboarding/communications",
                  body: { operationalProjectionRunId: progress.operational?.projectionRunId, blueprint: progress.blueprint },
                };

    try {
      const response = await fetch(target.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target.body),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        replayed?: boolean;
      };
      if (!response.ok || !result.ok) {
        if (result.error === "conflict") setFeedback(copy.conflict);
        else if (result.error === "invalid_blueprint") setFeedback(copy.invalid);
        else setFeedback(copy.failed);
        return;
      }
      setReplayed(Boolean(result.replayed));
      router.refresh();
    } catch {
      setFeedback(copy.failed);
    } finally {
      setRunning(null);
    }
  }

  const stages = [
    {
      key: "foundation",
      label: copy.foundation,
      done: true,
      enabled: false,
      description: copy.foundationText,
      detail: `${copy.property}: ${progress.property.lifecycleState.toUpperCase()} · ${copy.prod}: ${progress.production.active ? copy.active : copy.inactive} · ${copy.sandbox}: ${progress.sandbox.active ? copy.active : copy.inactive}`,
    },
    {
      key: "core",
      label: copy.core,
      done: Boolean(progress.core),
      enabled: !progress.core,
      description: copy.coreText,
      detail: progress.core ? `${progress.core.roomsCount} ${copy.rooms} · ${progress.core.departmentsCount} ${copy.departments}` : null,
    },
    {
      key: "operational",
      label: copy.operational,
      done: Boolean(progress.operational),
      enabled: Boolean(progress.core) && !progress.operational,
      description: copy.operationalText,
      detail: progress.operational ? `${progress.operational.servicesCount} ${copy.services} · ${progress.operational.workflowsCount} ${copy.workflows} · ${progress.operational.integrationsCount} ${copy.integrations} · ${progress.operational.routingRulesCount} ${copy.routing}` : null,
    },
    {
      key: "envelope",
      label: copy.envelope,
      done: Boolean(progress.envelope),
      enabled: Boolean(progress.operational) && !progress.envelope,
      description: copy.envelopeText,
      detail: progress.envelope ? `${progress.envelope.roleTemplatesCount} ${copy.roles}` : null,
    },
    {
      key: "native_content",
      label: copy.native,
      done: Boolean(progress.native),
      enabled: Boolean(progress.envelope) && !progress.native,
      description: copy.nativeText,
      detail: progress.native ? `${progress.native.hotelInfoItemsCount} ${copy.infoItems} · ${progress.native.venuesCount} ${copy.venues}` : null,
    },
    {
      key: "communications",
      label: copy.communications,
      done: Boolean(progress.communications),
      enabled: Boolean(progress.native) && !progress.communications,
      description: copy.communicationsText,
      detail: progress.communications
        ? `${progress.communications.configuredDepartmentsCount} ${copy.configuredDepartments} · ${progress.communications.phoneChannelsCount} ${copy.phone} · ${progress.communications.whatsappChannelsCount} ${copy.whatsapp} · ${progress.communications.emailChannelsCount} ${copy.email}`
        : null,
    },
  ] as const;

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-xl font-semibold">{copy.title}</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-400">{copy.subtitle}</p>
        {!failClosed && (
          <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-100">
            {copy.drift}
          </p>
        )}
      </div>

      <div className="grid gap-4">
        {stages.map((stage) => {
          const stageKey = stage.key as Stage | "foundation";
          const waiting = !stage.done && !stage.enabled;
          return (
            <article key={stage.key} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-neutral-100">{stage.label}</h3>
                  <p className="mt-2 max-w-4xl text-sm leading-6 text-neutral-400">{stage.description}</p>
                  {stage.detail && <p className="mt-2 text-xs text-neutral-500">{stage.detail}</p>}
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(stage.done, stage.enabled)}`}>
                  {stage.done ? copy.complete : stage.enabled ? copy.ready : copy.waiting}
                </span>
              </div>

              {stageKey !== "foundation" && stage.enabled && (
                <button
                  type="button"
                  disabled={Boolean(running) || !failClosed}
                  onClick={() => runStage(stageKey)}
                  className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {running === stageKey
                    ? copy.running
                    : stageKey === "core"
                      ? copy.runCore
                      : stageKey === "operational"
                        ? copy.runOperational
                        : stageKey === "envelope"
                          ? copy.runEnvelope
                          : stageKey === "native_content"
                            ? copy.runNative
                            : copy.runCommunications}
                </button>
              )}
              {waiting && <div className="mt-3 h-px bg-neutral-800" />}
            </article>
          );
        })}
      </div>

      {replayed && <p className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-100">{copy.replayed}</p>}
      {feedback && <p className="rounded-2xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-100">{feedback}</p>}

      {progress.communications && (
        <div className="rounded-3xl border border-violet-400/25 bg-violet-400/5 p-5">
          <h3 className="font-semibold text-violet-100">{copy.next}</h3>
          <p className="mt-2 text-sm leading-6 text-violet-100/75">{copy.nextText}</p>
        </div>
      )}
    </section>
  );
}
