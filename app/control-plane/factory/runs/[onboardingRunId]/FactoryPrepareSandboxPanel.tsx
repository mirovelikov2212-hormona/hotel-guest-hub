"use client";

import { useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

type PrepareResponse = {
  ok?: boolean;
  error?: string;
  status?: "RUNNING" | "READY" | "BLOCKED";
  productionActive?: boolean;
  sandboxActive?: boolean;
  runtimeSmoke?: {
    smokeRunId: string;
    state: string;
    retryAfterMs: number;
  } | null;
  certification?: {
    status: "not_started" | "complete";
    certificationRunId: string | null;
  };
  blockers?: Array<{ code: string; reason: string }>;
};

const COPY = {
  bg: {
    title: "Prepare Sandbox",
    body: "Един Sandbox-only action: валидира immutable Factory/Design lineage, проектира липсващите ресурси, наблюдава exact Preview runtime и делегира финалната мутация към съществуващия P2.5 certification authority.",
    guard: "Production activation и real Guest Communications delivery не са част от този flow.",
    button: "Подготви и сертифицирай Sandbox",
    running: "Sandbox подготовката работи…",
    waiting: "Изчаква trusted Preview observation window…",
    ready: "READY — Sandbox е сертифициран. Production остава неактивен.",
    blocked: "BLOCKED",
    failed: "Prepare Sandbox не можа да завърши. Следваща стъпка не е изпълнена автоматично.",
  },
  en: {
    title: "Prepare Sandbox",
    body: "One Sandbox-only action: validates immutable Factory/Design lineage, projects missing resources, observes the exact Preview runtime and delegates the final mutation to the existing P2.5 certification authority.",
    guard: "Production activation and real Guest Communications delivery are not part of this flow.",
    button: "Prepare and certify Sandbox",
    running: "Sandbox preparation is running…",
    waiting: "Waiting for the trusted Preview observation window…",
    ready: "READY — Sandbox is certified. Production remains inactive.",
    blocked: "BLOCKED",
    failed: "Prepare Sandbox could not complete. No later action was executed automatically.",
  },
} as const;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function FactoryPrepareSandboxPanel({
  lang,
  onboardingRunId,
  productionActive,
}: {
  lang: ControlPlaneLang;
  onboardingRunId: string;
  productionActive: boolean;
}) {
  const copy = COPY[lang];
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<Array<{ code: string; reason: string }>>([]);

  async function invoke(smokeRunId?: string) {
    const response = await fetch("/api/control-plane/onboarding/prepare-sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingRunId, smokeRunId: smokeRunId || undefined }),
    });
    const result = (await response.json().catch(() => ({}))) as PrepareResponse;
    if (!response.ok || !result.ok) throw new Error(result.error || "prepare_sandbox_failed");
    return result;
  }

  async function run() {
    if (running || productionActive) return;
    setRunning(true);
    setMessage(copy.running);
    setBlockers([]);

    try {
      let result = await invoke();
      for (let attempt = 0; attempt < 80 && result.status === "RUNNING"; attempt += 1) {
        const smokeRunId = result.runtimeSmoke?.smokeRunId;
        if (!smokeRunId) throw new Error("prepare_sandbox_smoke_identity_missing");
        setMessage(copy.waiting);
        const retryAfterMs = Math.max(1_000, Math.min(65_000, Number(result.runtimeSmoke?.retryAfterMs || 2_000)));
        await sleep(retryAfterMs);
        result = await invoke(smokeRunId);
      }

      if (result.status === "READY") {
        setMessage(copy.ready);
        window.setTimeout(() => window.location.reload(), 750);
        return;
      }
      if (result.status === "BLOCKED") {
        setMessage(copy.blocked);
        setBlockers(result.blockers || []);
        return;
      }
      throw new Error("prepare_sandbox_poll_limit_reached");
    } catch {
      setMessage(copy.failed);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-3xl border border-cyan-400/25 bg-cyan-400/5 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <h2 className="text-xl font-semibold text-cyan-100">{copy.title}</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-300">{copy.body}</p>
          <p className="mt-2 text-xs font-semibold text-cyan-200/75">{copy.guard}</p>
        </div>
        <button
          type="button"
          disabled={running || productionActive}
          onClick={run}
          className="rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-4 py-2.5 text-sm font-semibold text-cyan-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? copy.running : copy.button}
        </button>
      </div>

      {message && (
        <p className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${blockers.length ? "border-rose-400/25 bg-rose-400/10 text-rose-100" : "border-cyan-400/20 bg-neutral-950/40 text-cyan-100"}`}>
          {message}
        </p>
      )}
      {blockers.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm text-rose-100/90">
          {blockers.map((item) => (
            <li key={item.code} className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2">
              <span className="font-mono text-xs text-rose-200">{item.code}</span>
              <span className="ml-2">{item.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
