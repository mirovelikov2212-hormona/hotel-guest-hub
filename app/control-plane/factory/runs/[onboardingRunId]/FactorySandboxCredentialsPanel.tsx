"use client";

import { useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

type Credential = {
  role: string;
  pin: string;
};

type ProvisionResponse = {
  ok?: boolean;
  error?: string;
  credentialCount?: number;
  credentials?: Credential[];
  productionCredentialsProvisioned?: boolean;
  sessionsRevoked?: boolean;
};

const COPY = {
  bg: {
    title: "8. Sandbox staff credentials",
    subtitle: "Създава нови PIN кодове само за сертифицирания Sandbox. Production остава inactive и без staff credentials.",
    rotate: "Генерирай нови Sandbox PIN кодове",
    rotating: "Генериране…",
    ready: "SANDBOX ONLY",
    productionSafe: "Production credentials: 0 · Sandbox sessions се прекратяват при ротация.",
    resultTitle: "Нови Sandbox PIN кодове",
    resultHint: "PIN кодовете се показват само в този екран. Запази нужните стойности преди refresh.",
    rotateAgain: "Генерирай отново",
    failed: "Sandbox PIN кодовете не бяха генерирани. Няма разрешена Production credential mutation.",
    role: "Роля",
    pin: "PIN",
  },
  en: {
    title: "8. Sandbox staff credentials",
    subtitle: "Creates fresh PINs only for the certified Sandbox. Production stays inactive and has no staff credentials.",
    rotate: "Generate new Sandbox PINs",
    rotating: "Generating…",
    ready: "SANDBOX ONLY",
    productionSafe: "Production credentials: 0 · Sandbox sessions are revoked on rotation.",
    resultTitle: "New Sandbox PINs",
    resultHint: "PINs are shown only in this screen. Save the values you need before refreshing.",
    rotateAgain: "Generate again",
    failed: "Sandbox PINs were not generated. No Production credential mutation is permitted.",
    role: "Role",
    pin: "PIN",
  },
} as const;

export default function FactorySandboxCredentialsPanel({
  lang,
  sandboxHotelId,
  certifiedRevisionId,
}: {
  lang: ControlPlaneLang;
  sandboxHotelId: string;
  certifiedRevisionId: string;
}) {
  const copy = COPY[lang];
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<Credential[] | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function provision() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/control-plane/sandbox-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sandboxHotelId,
          expectedCertifiedRevisionId: certifiedRevisionId,
          approval: {
            provisionSandboxCredentials: true,
            provisionProductionCredentials: false,
            rotateExisting: true,
          },
        }),
      });
      const result = (await response.json().catch(() => ({}))) as ProvisionResponse;
      const nextCredentials = Array.isArray(result.credentials)
        ? result.credentials.filter((item) => /^\d{6}$/.test(String(item.pin || "")) && Boolean(item.role))
        : [];

      if (
        !response.ok
        || result.ok !== true
        || result.productionCredentialsProvisioned !== false
        || result.sessionsRevoked !== true
        || nextCredentials.length === 0
        || Number(result.credentialCount) !== nextCredentials.length
      ) {
        throw new Error(result.error || "credential_provisioning_failed");
      }

      setCredentials(nextCredentials);
    } catch {
      setCredentials(null);
      setFeedback(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-cyan-400/25 bg-cyan-400/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-cyan-100">{copy.title}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-cyan-100/75">{copy.subtitle}</p>
        </div>
        <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
          {copy.ready}
        </span>
      </div>

      <p className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/50 px-4 py-3 text-sm leading-6 text-neutral-400">
        {copy.productionSafe}
      </p>

      {credentials ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
            <p className="text-sm font-semibold text-emerald-100">{copy.resultTitle}</p>
            <p className="mt-1 text-xs leading-5 text-emerald-100/70">{copy.resultHint}</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/45">
            <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-neutral-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <span>{copy.role}</span>
              <span>{copy.pin}</span>
            </div>
            {credentials.map((credential) => (
              <div key={credential.role} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-neutral-800/70 px-4 py-3 last:border-b-0">
                <span className="text-sm text-neutral-300">{credential.role}</span>
                <code className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-base font-semibold tracking-[0.18em] text-cyan-100">
                  {credential.pin}
                </code>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={provision}
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? copy.rotating : copy.rotateAgain}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={provision}
          className="mt-5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? copy.rotating : copy.rotate}
        </button>
      )}

      {feedback && (
        <p className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
          {feedback}
        </p>
      )}
    </section>
  );
}
