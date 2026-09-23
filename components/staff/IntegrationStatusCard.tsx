"use client";

import { useEffect, useState } from "react";

import { useStaffUi } from "@/components/staff/StaffUiProvider";

type StatusResult = {
  revision: number;
  configuredConnections: number;
  activeConnections: number;
  connections: Array<{
    connectionId: string;
    providerKey: string;
    systemType: string;
    displayName: string;
    mode: string;
    active: boolean;
    capabilities: string[];
    credentialConfigured: boolean;
    providerRuntimeVerified: boolean;
    state: string;
  }>;
  authority: {
    hotelManagerCanEdit: false;
    platformAdminOwnsConfiguration: true;
    directProviderDatabaseWritesAllowed: false;
    directAiExecutionAllowed: false;
  };
};

const COPY = {
  bg: {
    title: "Integrations",
    loading: "Проверка на интеграциите…",
    active: "активни",
    configured: "конфигурирани",
    noConnections: "Няма конфигурирани външни системи.",
    configurationOnly: "Configuration only",
    configuredUnverified: "Configured · runtime not verified",
    inactive: "Inactive",
    authority:
      "Конфигурацията е Platform Admin-only. Manager вижда статус, но не може да променя provider credentials или capabilities.",
  },
  en: {
    title: "Integrations",
    loading: "Checking integrations…",
    active: "active",
    configured: "configured",
    noConnections: "No external systems are configured.",
    configurationOnly: "Configuration only",
    configuredUnverified: "Configured · runtime not verified",
    inactive: "Inactive",
    authority:
      "Configuration is Platform Admin-only. The Manager can see status but cannot change provider credentials or capabilities.",
  },
  de: {
    title: "Integrationen",
    loading: "Integrationen werden geprüft…",
    active: "aktiv",
    configured: "konfiguriert",
    noConnections: "Keine externen Systeme konfiguriert.",
    configurationOnly: "Nur Konfiguration",
    configuredUnverified: "Konfiguriert · Runtime nicht verifiziert",
    inactive: "Inaktiv",
    authority:
      "Die Konfiguration ist nur für Platform Admins. Manager sehen den Status, können aber Credentials oder Capabilities nicht ändern.",
  },
} as const;

export default function IntegrationStatusCard({
  hotelSlug,
}: {
  hotelSlug: string;
}) {
  const { lang } = useStaffUi();
  const copy = COPY[lang] || COPY.en;
  const [result, setResult] = useState<StatusResult | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const modules = await fetch(
          `/api/staff/modules?${new URLSearchParams({
            hotelSlug,
            role: "manager",
          }).toString()}`,
          { cache: "no-store", credentials: "same-origin" },
        );
        const moduleBody = (await modules.json().catch(() => null)) as
          | {
              ok?: boolean;
              availability?: {
                modules?: { integrationLayer?: boolean };
              };
            }
          | null;

        if (
          !modules.ok
          || !moduleBody?.ok
          || moduleBody.availability?.modules?.integrationLayer !== true
        ) {
          if (!cancelled) {
            setVisible(false);
            setLoading(false);
          }
          return;
        }

        const response = await fetch(
          `/api/staff/integrations/status?${new URLSearchParams({
            hotelSlug,
          }).toString()}`,
          { cache: "no-store", credentials: "same-origin" },
        );
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; result?: StatusResult }
          | null;

        if (!cancelled) {
          setVisible(response.ok && body?.ok === true);
          setResult(body?.result || null);
        }
      } catch {
        if (!cancelled) {
          setVisible(false);
          setResult(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [hotelSlug]);

  if (!visible && !loading) return null;

  return (
    <section className="rounded-2xl border border-sky-300/20 bg-sky-400/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-100/70">
        {copy.title}
      </p>

      {loading ? (
        <p className="mt-2 text-sm text-white/50">{copy.loading}</p>
      ) : result ? (
        <>
          <p className="mt-2 text-sm text-white/65">
            {result.activeConnections} {copy.active} ·{" "}
            {result.configuredConnections} {copy.configured}
          </p>

          <div className="mt-3 space-y-2">
            {result.connections.length ? (
              result.connections.map((connection) => (
                <div
                  key={connection.connectionId}
                  className="rounded-xl border border-white/10 bg-black/20 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {connection.displayName}
                      </p>
                      <p className="mt-0.5 text-xs text-white/45">
                        {connection.systemType.toUpperCase()} ·{" "}
                        {connection.providerKey} · {connection.mode}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase text-white/55">
                      {connection.state === "configured_unverified"
                        ? copy.configuredUnverified
                        : connection.state === "configuration_only"
                          ? copy.configurationOnly
                          : copy.inactive}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-white/40">
                    {connection.capabilities.join(" · ") || "—"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-white/50">{copy.noConnections}</p>
            )}
          </div>

          <p className="mt-3 text-[11px] leading-5 text-white/40">
            {copy.authority}
          </p>
        </>
      ) : null}
    </section>
  );
}
