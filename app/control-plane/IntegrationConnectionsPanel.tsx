"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

type SystemType = "pms" | "pos" | "payment" | "identity" | "crm";
type Mode = "read_only" | "read_write";

type Connection = {
  connectionId: string;
  providerKey: string;
  systemType: SystemType;
  displayName: string;
  externalHotelId: string;
  mode: Mode;
  active: boolean;
  capabilities: string[];
  credentialRef: string | null;
  metadata: Record<string, string | number | boolean | null>;
};

type Result = {
  propertyId: string;
  organizationId: string;
  hotelId: string;
  stored: boolean;
  revision: number;
  connections: Connection[];
};

const CAPABILITIES: Record<SystemType, string[]> = {
  pms: [
    "reservation.read",
    "stay.read",
    "room_assignment.read",
    "stay.lifecycle.read",
    "folio.charge.post",
    "folio.note.post",
    "late_checkout.update",
  ],
  pos: ["transaction.read", "charge.post"],
  payment: [
    "payment.status.read",
    "payment.intent.create",
    "payment.refund.request",
  ],
  identity: ["access.status.read", "access.issue", "access.revoke"],
  crm: ["guest_profile.read", "guest_note.post"],
};

const WRITE_CAPABILITIES = new Set([
  "folio.charge.post",
  "folio.note.post",
  "late_checkout.update",
  "charge.post",
  "payment.intent.create",
  "payment.refund.request",
  "access.issue",
  "access.revoke",
  "guest_note.post",
]);

const COPY = {
  bg: {
    title: "Integration Layer",
    subtitle:
      "Provider-neutral връзки към PMS / POS / Payment / Identity / CRM. Тук няма secret стойности — само credential reference.",
    add: "Добави връзка",
    save: "Запази интеграциите",
    saving: "Записване…",
    reload: "Обнови",
    remove: "Премахни",
    provider: "Provider key",
    system: "Система",
    display: "Име",
    externalHotel: "External hotel ID",
    mode: "Режим",
    readOnly: "Read only",
    readWrite: "Read / write",
    credentialRef: "Credential reference",
    capabilities: "Capabilities",
    active: "Активна",
    revision: "Ревизия",
    saved: "Integration configuration е записана.",
    conflict: "Конфигурацията е променена. Обнови и опитай пак.",
    rejected: "Integration configuration е отхвърлена.",
    notEntitled: "Integration Layer не е активиран за този хотел.",
    unavailable: "Integration API не е достъпен.",
    noSecrets:
      "Не въвеждай API keys, tokens или passwords. Credential reference е само идентификатор към бъдещ secret provisioning.",
    hardware:
      "Digital-key / door-access capabilities са само adapter actions. GOSTAYA не генерира ключове и не управлява хардуера.",
  },
  en: {
    title: "Integration Layer",
    subtitle:
      "Provider-neutral PMS / POS / Payment / Identity / CRM connections. No secret values are stored here — only credential references.",
    add: "Add connection",
    save: "Save integrations",
    saving: "Saving…",
    reload: "Reload",
    remove: "Remove",
    provider: "Provider key",
    system: "System",
    display: "Display name",
    externalHotel: "External hotel ID",
    mode: "Mode",
    readOnly: "Read only",
    readWrite: "Read / write",
    credentialRef: "Credential reference",
    capabilities: "Capabilities",
    active: "Active",
    revision: "Revision",
    saved: "Integration configuration saved.",
    conflict: "The configuration changed. Reload and try again.",
    rejected: "Integration configuration was rejected.",
    notEntitled: "Integration Layer is not enabled for this hotel.",
    unavailable: "Integration API is unavailable.",
    noSecrets:
      "Do not enter API keys, tokens or passwords. Credential reference is only an identifier for future secret provisioning.",
    hardware:
      "Digital-key / door-access capabilities are adapter actions only. GOSTAYA does not generate keys or control hardware.",
  },
} as const;

function newConnection(index: number): Connection {
  return {
    connectionId: `connection_${index + 1}`,
    providerKey: "",
    systemType: "pms",
    displayName: "",
    externalHotelId: "",
    mode: "read_only",
    active: false,
    capabilities: [],
    credentialRef: null,
    metadata: {},
  };
}

function stripWriteCapabilities(connection: Connection): Connection {
  if (connection.mode === "read_write") return connection;
  return {
    ...connection,
    capabilities: connection.capabilities.filter(
      (capability) => !WRITE_CAPABILITIES.has(capability),
    ),
  };
}

export default function IntegrationConnectionsPanel({
  lang,
  propertyId,
}: {
  lang: ControlPlaneLang;
  propertyId: string;
}) {
  const copy = COPY[lang] || COPY.en;
  const [result, setResult] = useState<Result | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/control-plane/integrations?propertyId=${encodeURIComponent(propertyId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; result?: Result; error?: string }
        | null;

      if (!response.ok || !body?.ok || !body.result) {
        if (body?.error === "integration_module_not_entitled") {
          setFeedback(copy.notEntitled);
          setResult(null);
          setConnections([]);
          return;
        }
        throw new Error(body?.error || "unavailable");
      }

      setResult(body.result);
      setConnections(body.result.connections || []);
    } catch {
      setFeedback(copy.unavailable);
    } finally {
      setLoading(false);
    }
  }, [copy.notEntitled, copy.unavailable, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!result) return false;
    return JSON.stringify(connections) !== JSON.stringify(result.connections);
  }, [connections, result]);

  function patch(index: number, next: Partial<Connection>) {
    setFeedback(null);
    setConnections((current) =>
      current.map((connection, i) => {
        if (i !== index) return connection;
        const merged = { ...connection, ...next };

        if (next.systemType && next.systemType !== connection.systemType) {
          merged.capabilities = [];
        }

        return stripWriteCapabilities(merged);
      }),
    );
  }

  function toggleCapability(index: number, capability: string) {
    const connection = connections[index];
    if (!connection) return;
    if (
      connection.mode === "read_only"
      && WRITE_CAPABILITIES.has(capability)
    ) {
      return;
    }

    const set = new Set(connection.capabilities);
    if (set.has(capability)) set.delete(capability);
    else set.add(capability);
    patch(index, { capabilities: [...set].sort() });
  }

  function addConnection() {
    setConnections((current) => [
      ...current,
      newConnection(current.length),
    ]);
  }

  function removeConnection(index: number) {
    setConnections((current) =>
      current.filter((_, i) => i !== index),
    );
  }

  async function save() {
    if (!result || !dirty || saving) return;
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/control-plane/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          expectedRevision: result.revision,
          connections,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; result?: Result; error?: string }
        | null;

      if (!response.ok || !body?.ok || !body.result) {
        if (body?.error === "integration_revision_conflict") {
          setFeedback(copy.conflict);
        } else if (body?.error === "integration_config_rejected") {
          setFeedback(copy.rejected);
        } else if (body?.error === "integration_module_not_entitled") {
          setFeedback(copy.notEntitled);
        } else {
          setFeedback(copy.unavailable);
        }
        return;
      }

      setResult(body.result);
      setConnections(body.result.connections || []);
      setFeedback(copy.saved);
    } catch {
      setFeedback(copy.unavailable);
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 outline-none";

  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
            {copy.title}
          </p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-neutral-500">
            {copy.subtitle}
          </p>
          {result ? (
            <p className="mt-1 text-[11px] text-neutral-600">
              {copy.revision}: {result.revision}
            </p>
          ) : null}
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

      <div className="mt-3 space-y-3">
        {connections.map((connection, index) => (
          <article
            key={`${connection.connectionId}-${index}`}
            className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-[11px] text-neutral-500">
                ID
                <input
                  className={inputClass}
                  value={connection.connectionId}
                  onChange={(e) =>
                    patch(index, { connectionId: e.target.value })
                  }
                />
              </label>
              <label className="text-[11px] text-neutral-500">
                {copy.provider}
                <input
                  className={inputClass}
                  value={connection.providerKey}
                  onChange={(e) =>
                    patch(index, { providerKey: e.target.value })
                  }
                />
              </label>
              <label className="text-[11px] text-neutral-500">
                {copy.system}
                <select
                  className={inputClass}
                  value={connection.systemType}
                  onChange={(e) =>
                    patch(index, {
                      systemType: e.target.value as SystemType,
                    })
                  }
                >
                  {(["pms", "pos", "payment", "identity", "crm"] as SystemType[]).map(
                    (type) => (
                      <option key={type} value={type}>
                        {type.toUpperCase()}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="text-[11px] text-neutral-500">
                {copy.mode}
                <select
                  className={inputClass}
                  value={connection.mode}
                  onChange={(e) =>
                    patch(index, { mode: e.target.value as Mode })
                  }
                >
                  <option value="read_only">{copy.readOnly}</option>
                  <option value="read_write">{copy.readWrite}</option>
                </select>
              </label>
              <label className="text-[11px] text-neutral-500">
                {copy.display}
                <input
                  className={inputClass}
                  value={connection.displayName}
                  onChange={(e) =>
                    patch(index, { displayName: e.target.value })
                  }
                />
              </label>
              <label className="text-[11px] text-neutral-500">
                {copy.externalHotel}
                <input
                  className={inputClass}
                  value={connection.externalHotelId}
                  onChange={(e) =>
                    patch(index, { externalHotelId: e.target.value })
                  }
                />
              </label>
              <label className="text-[11px] text-neutral-500 md:col-span-2">
                {copy.credentialRef}
                <input
                  className={inputClass}
                  value={connection.credentialRef || ""}
                  onChange={(e) =>
                    patch(index, {
                      credentialRef: e.target.value || null,
                    })
                  }
                />
              </label>
            </div>

            <div className="mt-3">
              <p className="text-[11px] font-semibold text-neutral-500">
                {copy.capabilities}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CAPABILITIES[connection.systemType].map((capability) => {
                  const disabled =
                    connection.mode === "read_only"
                    && WRITE_CAPABILITIES.has(capability);
                  return (
                    <label
                      key={capability}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                        disabled
                          ? "border-neutral-800 text-neutral-700"
                          : "border-neutral-700 text-neutral-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={connection.capabilities.includes(capability)}
                        disabled={disabled}
                        onChange={() =>
                          toggleCapability(index, capability)
                        }
                      />
                      {capability}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-neutral-400">
                <input
                  type="checkbox"
                  checked={connection.active}
                  onChange={(e) =>
                    patch(index, { active: e.target.checked })
                  }
                />
                {copy.active}
              </label>
              <button
                type="button"
                onClick={() => removeConnection(index)}
                className="rounded-lg border border-rose-400/20 px-3 py-1.5 text-xs font-semibold text-rose-300"
              >
                {copy.remove}
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addConnection}
          disabled={loading || saving || !result}
          className="rounded-xl border border-neutral-700 px-3 py-2 text-xs font-semibold text-neutral-300 disabled:opacity-40"
        >
          + {copy.add}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!result || !dirty || loading || saving}
          className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-35"
        >
          {saving ? copy.saving : copy.save}
        </button>
      </div>

      <p className="mt-3 text-[11px] leading-5 text-amber-200/60">
        {copy.noSecrets}
      </p>
      <p className="text-[11px] leading-5 text-neutral-600">
        {copy.hardware}
      </p>

      {feedback ? (
        <p className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
