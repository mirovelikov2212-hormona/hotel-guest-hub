"use client";

import { useState } from "react";
import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

type FoundationResult = {
  ok?: boolean;
  error?: string;
  replayed?: boolean;
  onboardingRunId?: string;
  propertyId?: string;
  productionHotelId?: string;
  sandboxHotelId?: string;
  blueprintHash?: string;
};

type Props = {
  lang: ControlPlaneLang;
  blueprint: Record<string, unknown>;
  expectedBlueprintHash: string;
  productionSlug: string;
  sandboxSlug: string;
};

const COPY = {
  bg: {
    title: "Създай draft хотел",
    explanation: "Това създава реалната Product Factory основа: draft Property + отделни неактивни Production и Sandbox hotel identities. Нищо не се публикува и хотелът не става LIVE.",
    confirm: "Потвърждавам, че искам да създам draft tenant и че Production и Sandbox трябва да останат неактивни.",
    create: "Създай draft хотел",
    creating: "Създаване…",
    success: "Draft хотелът е създаден успешно",
    replayed: "Заявката е безопасно повторена и върна същия onboarding run.",
    draft: "Property: DRAFT",
    production: "Production: INACTIVE",
    sandbox: "Sandbox: INACTIVE",
    noLive: "Revision: unpublished · LIVE activation: no",
    stale: "Blueprint-ът е променен след preflight. Валидирай го отново преди създаване.",
    conflict: "Тази хотелска идентичност вече съществува или idempotency заявката е в конфликт.",
    approval: "Необходимо е изрично потвърждение.",
    failed: "Draft хотелът не можа да бъде създаден. Данните не са активирани; провери статуса и опитай отново със същия preflight.",
    run: "Onboarding run",
    propertyId: "Property ID",
    productionId: "Production Hotel ID",
    sandboxId: "Sandbox Hotel ID",
  },
  en: {
    title: "Create draft hotel",
    explanation: "This creates the real Product Factory foundation: a draft Property plus separate inactive Production and Sandbox hotel identities. Nothing is published and the hotel does not become LIVE.",
    confirm: "I confirm that I want to create the draft tenant and that Production and Sandbox must remain inactive.",
    create: "Create draft hotel",
    creating: "Creating…",
    success: "Draft hotel created successfully",
    replayed: "The request was safely replayed and returned the same onboarding run.",
    draft: "Property: DRAFT",
    production: "Production: INACTIVE",
    sandbox: "Sandbox: INACTIVE",
    noLive: "Revision: unpublished · LIVE activation: no",
    stale: "The blueprint changed after preflight. Validate it again before creation.",
    conflict: "This hotel identity already exists or the idempotency request conflicts.",
    approval: "Explicit confirmation is required.",
    failed: "The draft hotel could not be created. Nothing was activated; check the status and retry with the same preflight.",
    run: "Onboarding run",
    propertyId: "Property ID",
    productionId: "Production Hotel ID",
    sandboxId: "Sandbox Hotel ID",
  },
} as const;

const FOUNDATION_APPROVAL = Object.freeze({
  createDraftTenant: true,
  keepProductionInactive: true,
  keepSandboxInactive: true,
  publishRevision: false,
  activateLive: false,
});

export default function FactoryFoundationCreatePanel({
  lang,
  blueprint,
  expectedBlueprintHash,
  productionSlug,
  sandboxSlug,
}: Props) {
  const copy = COPY[lang];
  const [confirmed, setConfirmed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<FoundationResult | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => `proof:acceptance:${crypto.randomUUID()}`);

  async function createDraftHotel() {
    if (!confirmed || creating || result?.ok) return;
    setCreating(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/control-plane/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          expectedBlueprintHash,
          approval: FOUNDATION_APPROVAL,
          blueprint,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as FoundationResult;
      if (!response.ok || !payload.ok) {
        if (payload.error === "stale_preflight") setFeedback(copy.stale);
        else if (payload.error === "conflict") setFeedback(copy.conflict);
        else if (payload.error === "approval_required") setFeedback(copy.approval);
        else setFeedback(copy.failed);
        return;
      }
      setResult(payload);
    } catch {
      // Keep the same idempotency key so a retry safely replays a transaction
      // that may have committed before the network response was lost.
      setFeedback(copy.failed);
    } finally {
      setCreating(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4">
        <p className="font-semibold text-emerald-100">{copy.success}</p>
        {result.replayed && <p className="mt-1 text-xs text-emerald-200">{copy.replayed}</p>}
        <div className="mt-3 grid gap-2 text-xs text-neutral-300 sm:grid-cols-2">
          <p>{copy.draft}</p><p>{copy.production}</p><p>{copy.sandbox}</p><p>{copy.noLive}</p>
        </div>
        <dl className="mt-4 grid gap-2 text-xs text-neutral-400">
          <div><dt className="inline font-semibold text-neutral-300">{copy.run}: </dt><dd className="inline break-all">{result.onboardingRunId}</dd></div>
          <div><dt className="inline font-semibold text-neutral-300">{copy.propertyId}: </dt><dd className="inline break-all">{result.propertyId}</dd></div>
          <div><dt className="inline font-semibold text-neutral-300">{copy.productionId}: </dt><dd className="inline break-all">{result.productionHotelId}</dd></div>
          <div><dt className="inline font-semibold text-neutral-300">{copy.sandboxId}: </dt><dd className="inline break-all">{result.sandboxHotelId}</dd></div>
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4">
      <h3 className="font-semibold text-amber-100">{copy.title}</h3>
      <p className="mt-2 text-xs leading-5 text-amber-50/80">{copy.explanation}</p>
      <div className="mt-3 grid gap-2 text-xs text-neutral-300 sm:grid-cols-2">
        <p>Production: <span className="font-mono">{productionSlug}</span></p>
        <p>Sandbox: <span className="font-mono">{sandboxSlug}</span></p>
      </div>
      <label className="mt-4 flex items-start gap-3 rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-xs text-neutral-200">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" />
        <span>{copy.confirm}</span>
      </label>
      <button
        type="button"
        disabled={!confirmed || creating}
        onClick={createDraftHotel}
        className="mt-4 w-full rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {creating ? copy.creating : copy.create}
      </button>
      {feedback && <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-xs text-rose-100">{feedback}</p>}
    </div>
  );
}