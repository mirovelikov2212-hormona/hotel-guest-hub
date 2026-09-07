"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { MassageCatalogService } from "@/lib/server/massage-catalog-admin";

const BASE_LANGS = ["bg", "en", "de", "ro", "cs", "ru"] as const;

function blankService(nextOrder: number): MassageCatalogService {
  return {
    serviceId: "",
    active: true,
    nameI18n: { bg: "", en: "", de: "", ro: "", cs: "", ru: "" },
    durationMinutes: 30,
    bufferMinutes: 15,
    price: 0,
    currency: "EUR",
    sortOrder: nextOrder,
    sourceKind: "native",
    updatedAt: "",
  };
}

function cleanTranslations(value: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(value)
      .map(([lang, text]) => [lang.trim(), text.trim()] as const)
      .filter(([lang, text]) => lang && text),
  );
}

function ServiceEditor({
  hotelId,
  initial,
  isNew = false,
}: {
  hotelId: string;
  initial: MassageCatalogService;
  isNew?: boolean;
}) {
  const router = useRouter();
  const [service, setService] = useState(initial);
  const [newLang, setNewLang] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const languages = useMemo(
    () => Array.from(new Set([...BASE_LANGS, ...Object.keys(service.nameI18n)])).sort(),
    [service.nameI18n],
  );

  function setField<K extends keyof MassageCatalogService>(key: K, value: MassageCatalogService[K]) {
    setService((current) => ({ ...current, [key]: value }));
  }

  function setTranslation(lang: string, value: string) {
    setService((current) => ({
      ...current,
      nameI18n: { ...current.nameI18n, [lang]: value },
    }));
  }

  function addLanguage() {
    const lang = newLang.trim();
    if (!lang) return;
    setService((current) => ({
      ...current,
      nameI18n: { ...current.nameI18n, [lang]: current.nameI18n[lang] || "" },
    }));
    setNewLang("");
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/control-plane/massage-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          serviceId: service.serviceId,
          active: service.active,
          nameI18n: cleanTranslations(service.nameI18n),
          durationMinutes: service.durationMinutes,
          bufferMinutes: service.bufferMinutes,
          price: service.price,
          currency: service.currency,
          sortOrder: service.sortOrder,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setMessage("Saved");
      router.refresh();
      if (isNew) setService(blankService(service.sortOrder + 1));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-2xl border border-[var(--cp-border)] bg-[var(--cp-card)] p-5 shadow-[var(--cp-shadow)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-[var(--cp-muted)]">
              Service ID
              <input
                value={service.serviceId}
                readOnly={!isNew}
                onChange={(event) => setField("serviceId", event.target.value)}
                placeholder="sports"
                className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-3 text-sm text-[var(--cp-text)] outline-none focus:border-teal-500"
              />
            </label>
            <label className="text-xs font-semibold text-[var(--cp-muted)]">
              Price
              <input
                type="number"
                min="0"
                step="0.01"
                value={service.price}
                onChange={(event) => setField("price", Number(event.target.value))}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-3 text-sm text-[var(--cp-text)] outline-none focus:border-teal-500"
              />
            </label>
            <label className="text-xs font-semibold text-[var(--cp-muted)]">
              Currency
              <input
                value={service.currency}
                maxLength={3}
                onChange={(event) => setField("currency", event.target.value.toUpperCase())}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-3 text-sm uppercase text-[var(--cp-text)] outline-none focus:border-teal-500"
              />
            </label>
            <label className="flex min-h-11 items-end gap-2 pb-2 text-sm font-semibold text-[var(--cp-text)]">
              <input
                type="checkbox"
                checked={service.active}
                onChange={(event) => setField("active", event.target.checked)}
                className="h-4 w-4"
              />
              Active
            </label>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-[var(--cp-muted)]">
              Duration (min)
              <input
                type="number"
                min="1"
                max="480"
                value={service.durationMinutes}
                onChange={(event) => setField("durationMinutes", Number(event.target.value))}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-3 text-sm text-[var(--cp-text)] outline-none focus:border-teal-500"
              />
            </label>
            <label className="text-xs font-semibold text-[var(--cp-muted)]">
              Buffer (min)
              <input
                type="number"
                min="0"
                max="180"
                value={service.bufferMinutes}
                onChange={(event) => setField("bufferMinutes", Number(event.target.value))}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-3 text-sm text-[var(--cp-text)] outline-none focus:border-teal-500"
              />
            </label>
            <label className="text-xs font-semibold text-[var(--cp-muted)]">
              Sort order
              <input
                type="number"
                min="0"
                max="10000"
                value={service.sortOrder}
                onChange={(event) => setField("sortOrder", Number(event.target.value))}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-3 text-sm text-[var(--cp-text)] outline-none focus:border-teal-500"
              />
            </label>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cp-muted)]">Translations</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {languages.map((lang) => (
                <label key={lang} className="text-xs font-semibold text-[var(--cp-muted)]">
                  {lang}
                  <input
                    value={service.nameI18n[lang] || ""}
                    onChange={(event) => setTranslation(lang, event.target.value)}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-3 text-sm text-[var(--cp-text)] outline-none focus:border-teal-500"
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 flex max-w-md gap-2">
              <input
                value={newLang}
                onChange={(event) => setNewLang(event.target.value)}
                placeholder="Add locale, e.g. es or pt-BR"
                className="min-h-10 flex-1 rounded-xl border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-3 text-sm text-[var(--cp-text)] outline-none focus:border-teal-500"
              />
              <button type="button" onClick={addLanguage} className="rounded-xl border border-[var(--cp-border)] px-3 text-xs font-semibold text-[var(--cp-text)]">
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="flex min-w-32 flex-col gap-2 lg:items-end">
          <span className="text-xs text-[var(--cp-muted)]">{isNew ? "New central service" : service.sourceKind === "native" ? "StayHub authority" : service.sourceKind}</span>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="min-h-11 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : isNew ? "Create service" : "Save"}
          </button>
          {message ? <span className="text-xs text-[var(--cp-muted)]">{message}</span> : null}
        </div>
      </div>
    </article>
  );
}

export default function MassageCatalogEditor({
  hotelId,
  services,
}: {
  hotelId: string;
  services: MassageCatalogService[];
}) {
  const nextOrder = services.reduce((max, service) => Math.max(max, service.sortOrder), 0) + 1;

  return (
    <div className="space-y-4">
      {services.map((service) => (
        <ServiceEditor key={service.serviceId} hotelId={hotelId} initial={service} />
      ))}
      <ServiceEditor hotelId={hotelId} initial={blankService(nextOrder)} isNew />
    </div>
  );
}
