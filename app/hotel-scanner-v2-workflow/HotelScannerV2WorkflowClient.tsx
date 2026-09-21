"use client";

import Link from "next/link";
import { useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";

type IntakeItem = {
  name: string;
  hours?: string;
  url?: string;
  value?: string;
};

type QuickPreview = {
  ok?: boolean;
  mode?: "quick_preview";
  runtimeMs?: number;
  sourcePackage?: HotelIntelligencePackage;
  components?: Array<{
    domain: string;
    count: number;
    namedCount?: number;
    items?: IntakeItem[];
  }>;
  contacts?: {
    phones?: string[];
    emails?: string[];
    addresses?: string[];
    website?: string;
  };
  error?: string;
};

const PACKAGE_STORAGE_KEY = "stayhub:hotel-intelligence-package:v1";
const VISIBLE_DOMAINS = new Set(["accommodation", "gastronomy", "policies", "contacts", "info"]);

const COPY = {
  bg: {
    title: "Hotel Intake",
    help: "Въведи официалния сайт. Scanner-ът извлича само данните, които използваме за бърз onboarding: видове стаи, гастро обекти и работно време, контакти и хотелски политики.",
    url: "Официален хотелски сайт",
    start: "Извлечи данните",
    starting: "Извличане…",
    preview: "Намерена информация",
    previewHelp: "Това е работна информация за Design Studio. Всичко останало се изисква директно от хотела при onboarding.",
    failed: "Scanner-ът не успя да извлече данните.",
    designStudio: "Отвори в Design Studio",
    found: "Намерени",
    openingHours: "Работно време",
    hoursMissing: "Работно време не е открито",
    notFound: "Не е открито на сайта",
    phone: "Телефон",
    address: "Адрес",
    website: "Web",
    source: "Източник",
  },
  en: {
    title: "Hotel Intake",
    help: "Enter the official website. The Scanner extracts only the data used for fast onboarding: room types, dining venues and opening hours, contacts, and hotel policies.",
    url: "Official hotel website",
    start: "Extract data",
    starting: "Extracting…",
    preview: "Discovered information",
    previewHelp: "This is working information for Design Studio. Everything else is requested directly from the hotel during onboarding.",
    failed: "The Scanner could not extract the data.",
    designStudio: "Open in Design Studio",
    found: "Found",
    openingHours: "Opening hours",
    hoursMissing: "Opening hours not found",
    notFound: "Not found on the website",
    phone: "Phone",
    address: "Address",
    website: "Web",
    source: "Source",
  },
} as const;

function formatDuration(ms?: number) {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${Math.round(ms / 1000)} s`;
}

function domainLabel(domain: string, lang: ControlPlaneLang) {
  const labels: Record<string, [string, string]> = {
    accommodation: ["Настаняване", "Accommodation"],
    gastronomy: ["Ресторанти и барове", "Restaurants & bars"],
    policies: ["Политики / FAQ", "Policies / FAQ"],
    contacts: ["Контакти", "Contacts"],
    info: ["Инфо", "Info"],
  };
  return labels[domain]?.[lang === "bg" ? 0 : 1] || domain;
}

export default function HotelScannerV2WorkflowClient({ lang }: { lang: ControlPlaneLang }) {
  const copy = COPY[lang];
  const [url, setUrl] = useState("https://pavelbanyagrand.com/");
  const [starting, setStarting] = useState(false);
  const [quickPreview, setQuickPreview] = useState<QuickPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startScan() {
    if (!url.trim() || starting) return;
    setStarting(true);
    setQuickPreview(null);
    setError(null);

    try {
      const response = await fetch("/api/control-plane/hotel-scanner/scan-v2-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), lang }),
      });
      const body = (await response.json().catch(() => ({}))) as QuickPreview;
      if (!response.ok || !body.ok || !body.sourcePackage) {
        setError(body.error || "scanner_intake_failed");
        return;
      }
      setQuickPreview(body);
    } catch {
      setError("network_error");
    } finally {
      setStarting(false);
    }
  }

  const visibleComponents = (quickPreview?.components || []).filter((component) => VISIBLE_DOMAINS.has(component.domain));

  return (
    <div className="space-y-6">
      <section className="v2-panel p-5 sm:p-6">
        <h2 className="v2-section-title text-xl">{copy.title}</h2>
        <p className="v2-muted mt-1 max-w-4xl text-sm leading-6">{copy.help}</p>
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="text-sm font-semibold">
            {copy.url}
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={starting}
              className="v2-input mt-2"
            />
          </label>
          <button
            type="button"
            onClick={() => void startScan()}
            disabled={starting || !url.trim()}
            className="v2-button min-w-56"
          >
            {starting ? copy.starting : copy.start}
          </button>
        </div>
      </section>

      {error ? (
        <section className="v2-panel p-5 sm:p-6">
          <span className="v2-pill v2-pill-bad">FAILED</span>
          <p className="v2-muted mt-3 text-sm">{copy.failed}</p>
          <p className="mt-2 font-mono text-sm">{error}</p>
        </section>
      ) : null}

      {quickPreview ? (
        <section className="v2-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="v2-section-title text-xl">{copy.preview}</h2>
              <p className="v2-muted mt-1 max-w-4xl text-sm leading-6">{copy.previewHelp}</p>
            </div>
            {quickPreview.runtimeMs ? (
              <span className="v2-pill v2-pill-good">{formatDuration(quickPreview.runtimeMs)}</span>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {visibleComponents.map((component) => {
              const items = component.items || [];
              const isContacts = component.domain === "contacts";
              const hasContacts = Boolean(
                quickPreview.contacts?.phones?.length
                || quickPreview.contacts?.emails?.length
                || quickPreview.contacts?.addresses?.length
              );

              return (
                <article key={component.domain} className="v2-card-soft p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{domainLabel(component.domain, lang)}</h3>
                      <p className="v2-muted mt-1 text-sm">
                        {isContacts
                          ? (hasContacts ? copy.found : copy.notFound)
                          : items.length
                            ? `${copy.found}: ${items.length}`
                            : copy.notFound}
                      </p>
                    </div>
                  </div>

                  {isContacts ? (
                    <div className="mt-4 space-y-2 text-sm">
                      {(quickPreview.contacts?.phones || []).map((phone) => (
                        <p key={`phone:${phone}`}><strong>{copy.phone}:</strong> {phone}</p>
                      ))}
                      {(quickPreview.contacts?.emails || []).map((email) => (
                        <p key={`email:${email}`}><strong>Email:</strong> {email}</p>
                      ))}
                      {(quickPreview.contacts?.addresses || []).map((address) => (
                        <p key={`address:${address}`}><strong>{copy.address}:</strong> {address}</p>
                      ))}
                      {quickPreview.contacts?.website ? (
                        <p className="break-all"><strong>{copy.website}:</strong> {quickPreview.contacts.website}</p>
                      ) : null}
                    </div>
                  ) : items.length ? (
                    <div className="mt-4 space-y-2">
                      {items.map((item, index) => (
                        <div key={`${component.domain}:${item.name}:${index}`} className="v2-card p-3">
                          {component.domain === "info" ? (
                            <p className="text-sm"><strong>{item.name}:</strong> {item.value || "—"}</p>
                          ) : (
                            <p className="text-sm font-semibold">{item.name}</p>
                          )}
                          {component.domain === "gastronomy" ? (
                            <p className="v2-muted mt-1 text-xs">
                              {item.hours ? `${copy.openingHours}: ${item.hours}` : copy.hoursMissing}
                            </p>
                          ) : null}
                          {component.domain === "policies" && item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="v2-source-link mt-2 block break-all text-xs"
                            >
                              {copy.source}
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          {quickPreview.sourcePackage ? (
            <div className="mt-5">
              <Link
                href={`/design-studio?lang=${lang}&preview=quick`}
                onClick={() => window.sessionStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(quickPreview.sourcePackage))}
                className="v2-button inline-flex text-sm"
              >
                {copy.designStudio}
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
