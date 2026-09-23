"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

type ModuleKey =
  | "guest_hub"
  | "staff_operations"
  | "operational_ai"
  | "staff_development"
  | "manager_intelligence"
  | "revenue_intelligence"
  | "integration_layer";

type Config = {
  propertyId: string;
  organizationId: string;
  hotelId: string;
  stored: boolean;
  revision: number;
  enabledModules: ModuleKey[];
};

type Runtime = {
  source: string;
  enabledModules: ModuleKey[];
  moduleAccess: Record<ModuleKey, boolean>;
  configRevision: number | null;
  commercial: {
    effectiveStatus: string;
    accessAllowed: boolean;
    planCode: string | null;
  };
};

type Props = {
  lang: ControlPlaneLang;
  propertyId: string;
};

const MODULES: Array<{
  key: ModuleKey;
  dependencies: ModuleKey[];
}> = [
  { key: "guest_hub", dependencies: [] },
  { key: "staff_operations", dependencies: [] },
  { key: "operational_ai", dependencies: ["guest_hub"] },
  { key: "staff_development", dependencies: ["staff_operations"] },
  { key: "manager_intelligence", dependencies: ["staff_development"] },
  { key: "revenue_intelligence", dependencies: ["staff_operations"] },
  { key: "integration_layer", dependencies: ["guest_hub"] },
];

const COPY = {
  bg: {
    title: "Продуктови модули",
    subtitle:
      "Platform Admin entitlement. Хотелът не може сам да отключва платени модули.",
    guest_hub: "Guest Hub",
    staff_operations: "Staff Operations",
    operational_ai: "Operational AI",
    staff_development: "Standards & Training",
    manager_intelligence: "Manager Intelligence",
    revenue_intelligence: "Revenue & Upsell",
    integration_layer: "Integration Layer",
    core: "Основен модул",
    runtime: "Runtime",
    configured: "Записана конфигурация",
    revision: "Ревизия",
    source: "Източник",
    save: "Запази модулите",
    saving: "Записване…",
    reload: "Обнови",
    saved: "Модулите са записани.",
    conflict:
      "Конфигурацията е променена междувременно. Обнови и опитай отново.",
    forbidden: "Нямаш Platform Admin право за тази операция.",
    unavailable: "Module entitlement API не е достъпен.",
    dependency:
      "Зависимостите се включват автоматично; изключването на базов модул изключва зависимите.",
    compatibility:
      "Legacy / non-production / full_trial може временно да разрешава повече модули от записаната конфигурация.",
  },
  en: {
    title: "Product modules",
    subtitle:
      "Platform Admin entitlement. Hotels cannot unlock paid modules themselves.",
    guest_hub: "Guest Hub",
    staff_operations: "Staff Operations",
    operational_ai: "Operational AI",
    staff_development: "Standards & Training",
    manager_intelligence: "Manager Intelligence",
    revenue_intelligence: "Revenue & Upsell",
    integration_layer: "Integration Layer",
    core: "Core module",
    runtime: "Runtime",
    configured: "Stored configuration",
    revision: "Revision",
    source: "Source",
    save: "Save modules",
    saving: "Saving…",
    reload: "Reload",
    saved: "Module entitlements saved.",
    conflict:
      "The configuration changed in the meantime. Reload and try again.",
    forbidden: "You do not have Platform Admin authority for this operation.",
    unavailable: "Module entitlement API is unavailable.",
    dependency:
      "Dependencies are enabled automatically; disabling a base module also disables dependents.",
    compatibility:
      "Legacy / non-production / full_trial may temporarily allow more modules than the stored configuration.",
  },
} as const;

function dependentsOf(key: ModuleKey) {
  return MODULES.filter((module) => module.dependencies.includes(key)).map(
    (module) => module.key,
  );
}

function addWithDependencies(current: Set<ModuleKey>, key: ModuleKey) {
  const next = new Set(current);
  const visit = (moduleKey: ModuleKey) => {
    if (moduleKey !== "guest_hub") next.add(moduleKey);
    const module = MODULES.find((item) => item.key === moduleKey);
    for (const dependency of module?.dependencies || []) visit(dependency);
  };
  visit(key);
  return next;
}

function removeWithDependents(current: Set<ModuleKey>, key: ModuleKey) {
  const next = new Set(current);
  const visit = (moduleKey: ModuleKey) => {
    next.delete(moduleKey);
    for (const dependent of dependentsOf(moduleKey)) visit(dependent);
  };
  visit(key);
  return next;
}

export default function CommercialModuleEntitlementsPanel({
  lang,
  propertyId,
}: Props) {
  const copy = COPY[lang];
  const [config, setConfig] = useState<Config | null>(null);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [selected, setSelected] = useState<Set<ModuleKey>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/control-plane/commercial/module-entitlements?propertyId=${encodeURIComponent(propertyId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; config?: Config; runtime?: Runtime; error?: string }
        | null;
      if (!response.ok || !body?.ok || !body.config || !body.runtime) {
        throw new Error(body?.error || "unavailable");
      }

      setConfig(body.config);
      setRuntime(body.runtime);
      setSelected(
        new Set(
          body.config.enabledModules.filter(
            (key) => key !== "guest_hub",
          ),
        ),
      );
    } catch {
      setFeedback(copy.unavailable);
    } finally {
      setLoading(false);
    }
  }, [copy.unavailable, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!config) return false;
    const original = [...config.enabledModules]
      .filter((key) => key !== "guest_hub")
      .sort()
      .join("|");
    return [...selected].sort().join("|") !== original;
  }, [config, selected]);

  function toggle(key: ModuleKey) {
    if (key === "guest_hub") return;
    setFeedback(null);
    setSelected((current) =>
      current.has(key)
        ? removeWithDependents(current, key)
        : addWithDependencies(current, key),
    );
  }

  async function save() {
    if (!config || saving || !dirty) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(
        "/api/control-plane/commercial/module-entitlements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId,
            expectedRevision: config.revision,
            enabledModules: [...selected].sort(),
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; config?: Config; runtime?: Runtime; error?: string }
        | null;

      if (!response.ok || !body?.ok || !body.config || !body.runtime) {
        if (body?.error === "module_revision_conflict") {
          setFeedback(copy.conflict);
        } else if (body?.error === "forbidden") {
          setFeedback(copy.forbidden);
        } else {
          setFeedback(copy.unavailable);
        }
        return;
      }

      setConfig(body.config);
      setRuntime(body.runtime);
      setSelected(
        new Set(
          body.config.enabledModules.filter(
            (key) => key !== "guest_hub",
          ),
        ),
      );
      setFeedback(copy.saved);
    } catch {
      setFeedback(copy.unavailable);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
            {copy.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            {copy.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving}
          className="rounded-xl border border-neutral-700 px-3 py-2 text-xs font-semibold text-neutral-300 disabled:opacity-40"
        >
          {copy.reload}
        </button>
      </div>

      {runtime ? (
        <div className="mt-3 grid gap-2 text-xs text-neutral-400 sm:grid-cols-3">
          <p>
            {copy.runtime}:{" "}
            <span className="text-neutral-200">
              {runtime.commercial.effectiveStatus}
            </span>
          </p>
          <p>
            {copy.source}:{" "}
            <span className="text-neutral-200">{runtime.source}</span>
          </p>
          <p>
            {copy.revision}:{" "}
            <span className="text-neutral-200">{config?.revision ?? 0}</span>
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {MODULES.map((module) => {
          const checked =
            module.key === "guest_hub" || selected.has(module.key);
          const runtimeEnabled = runtime?.moduleAccess?.[module.key] === true;
          return (
            <label
              key={module.key}
              className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={module.key === "guest_hub" || loading || saving}
                onChange={() => toggle(module.key)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-200">
                  {copy[module.key]}
                </span>
                <span className="mt-1 block text-[11px] text-neutral-500">
                  {module.key === "guest_hub"
                    ? copy.core
                    : module.dependencies.length
                      ? `↳ ${module.dependencies
                          .map((key) => copy[key])
                          .join(", ")}`
                      : copy.configured}
                </span>
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  runtimeEnabled
                    ? "border-emerald-400/25 text-emerald-300"
                    : "border-neutral-700 text-neutral-500"
                }`}
              >
                {runtimeEnabled ? "ON" : "OFF"}
              </span>
            </label>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-5 text-neutral-600">
        {copy.dependency}
      </p>
      <p className="text-[11px] leading-5 text-neutral-600">
        {copy.compatibility}
      </p>

      <button
        type="button"
        onClick={() => void save()}
        disabled={!config || !dirty || loading || saving}
        className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-35"
      >
        {saving ? copy.saving : copy.save}
      </button>

      {feedback ? (
        <p className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
