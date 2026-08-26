"use client";

import { useMemo, useState } from "react";
import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import FactoryFoundationCreatePanel from "./FactoryFoundationCreatePanel";
import FactoryNativeContentStep, {
  buildFactoryNativeBlueprintInput,
  createEmptyNativeSetupDraft,
  type NativeSetupDraft,
  validateNativeSetupDraft,
} from "./FactoryNativeContentStep";
import FactoryCommunicationsStep, {
  validateCommunicationDepartments,
} from "./FactoryCommunicationsStep";

type DepartmentDraft = {
  key: string;
  id: string;
  name: string;
  hoursMode: "24h" | "window";
  opensAt: string;
  closesAt: string;
  afterHoursDepartmentId: string;
  phone: string;
  whatsapp: string;
  email: string;
};
type IntegrationDraft = { key: string; id: string; kind: string; adapterKey: string };
type WorkflowAction = "assign" | "condition" | "approval" | "wait" | "billing" | "notification" | "escalation" | "integration_action" | "complete";
type WorkflowStepDraft = { key: string; action: WorkflowAction; departmentId: string; integrationId: string };
type WorkflowDraft = { key: string; id: string; trigger: string; steps: WorkflowStepDraft[] };
type ServiceMode = "core" | "configurable" | "custom";
type ServicePriority = "low" | "normal" | "high" | "urgent";
type ServiceDraft = {
  key: string;
  id: string;
  name: string;
  mode: ServiceMode;
  departmentId: string;
  workflowId: string;
  integrationId: string;
  priorityDefault: ServicePriority;
};
type PreflightResult = {
  ok?: boolean;
  error?: string;
  blueprintHash?: string;
  identities?: {
    productionSlug: string;
    productionPublicSlug: string;
    sandboxSlug: string;
    sandboxPublicSlug: string;
  };
};

const WORKFLOW_ACTIONS: WorkflowAction[] = ["assign", "condition", "approval", "wait", "billing", "notification", "escalation", "integration_action", "complete"];
const SERVICE_MODES: ServiceMode[] = ["core", "configurable", "custom"];
const SERVICE_PRIORITIES: ServicePriority[] = ["low", "normal", "high", "urgent"];
const LAST_STEP = 5;

const COPY = {
  bg: {
    steps: ["Организация и хотел", "Стаи и езици", "Отдели", "Услуги · Workflows · Integrations", "Native съдържание · Комуникации", "Преглед и създаване"],
    next: "Напред", back: "Назад", validate: "Валидирай blueprint", validating: "Валидиране…",
    org: "Организация и хотел", rooms: "Стаи и езици", departments: "Отдели", operations: "Услуги · Workflows · Integrations", review: "Преглед · Preflight · Draft foundation",
    orgId: "Organization ID / slug", orgName: "Име на организацията", hotelName: "Име на хотела", internalSlug: "Вътрешен hotel slug", publicSlug: "Публичен slug", country: "Държава (ISO 2)", timezone: "IANA timezone",
    roomMode: "Начин за стаите", range: "Диапазон", list: "Списък", start: "Начало", end: "Край", pad: "Минимални цифри", prefix: "Префикс", suffix: "Суфикс", explicit: "Стаи — по една на ред", locales: "Езици / locales — разделени със запетая", roomCount: "Брой стаи",
    addDepartment: "+ Добави отдел", code: "Код", name: "Име", hours: "Работно време", allDay: "24 часа", window: "Часови диапазон", opens: "Отваря", closes: "Затваря", afterHours: "След работно време към", none: "— няма —", remove: "Премахни",
    integrations: "Integrations", integrationsHelp: "Само adapter metadata. Credentials, API keys и пароли не се въвеждат тук.", addIntegration: "+ Добави integration", integrationId: "Integration ID", kind: "Тип / kind", adapterKey: "Adapter key",
    workflows: "Workflows", workflowsHelp: "Подреди само разрешени Product Factory primitive стъпки.", addWorkflow: "+ Добави workflow", workflowId: "Workflow ID", trigger: "Trigger", stepsLabel: "Стъпки", addStep: "+ Стъпка", action: "Action", department: "Отдел", integration: "Integration",
    services: "Услуги", servicesHelp: "Простите услуги могат да сочат директно към отдел. Workflow и integration са optional.", addService: "+ Добави услуга", serviceId: "Service ID", mode: "Mode", workflow: "Workflow", priority: "Priority",
    valid: "Blueprint-ът е валиден и готов за draft foundation", hash: "Blueprint hash", prod: "Production", sandbox: "Sandbox", invalid: "Провери задължителните полета или Product Factory правилата.", unavailable: "Preflight временно не е достъпен.",
    note: "P4.3 разрешава само audited P2.1 foundation creation след exact preflight. Създадените Production и Sandbox identities остават неактивни; няма публикация, certification, LIVE activation или trial.",
  },
  en: {
    steps: ["Organization & hotel", "Rooms & locales", "Departments", "Services · Workflows · Integrations", "Native content · Communications", "Review & creation"],
    next: "Next", back: "Back", validate: "Validate blueprint", validating: "Validating…",
    org: "Organization & hotel", rooms: "Rooms & locales", departments: "Departments", operations: "Services · Workflows · Integrations", review: "Review · Preflight · Draft foundation",
    orgId: "Organization ID / slug", orgName: "Organization name", hotelName: "Hotel name", internalSlug: "Internal hotel slug", publicSlug: "Public slug", country: "Country (ISO 2)", timezone: "IANA timezone",
    roomMode: "Room input mode", range: "Range", list: "List", start: "Start", end: "End", pad: "Minimum digits", prefix: "Prefix", suffix: "Suffix", explicit: "Rooms — one per line", locales: "Languages / locales — comma separated", roomCount: "Room count",
    addDepartment: "+ Add department", code: "Code", name: "Name", hours: "Hours", allDay: "24 hours", window: "Time window", opens: "Opens", closes: "Closes", afterHours: "After hours to", none: "— none —", remove: "Remove",
    integrations: "Integrations", integrationsHelp: "Adapter metadata only. Credentials, API keys and passwords are never entered here.", addIntegration: "+ Add integration", integrationId: "Integration ID", kind: "Kind", adapterKey: "Adapter key",
    workflows: "Workflows", workflowsHelp: "Compose only approved Product Factory primitive steps.", addWorkflow: "+ Add workflow", workflowId: "Workflow ID", trigger: "Trigger", stepsLabel: "Steps", addStep: "+ Step", action: "Action", department: "Department", integration: "Integration",
    services: "Services", servicesHelp: "Simple services may route directly to a department. Workflow and integration are optional.", addService: "+ Add service", serviceId: "Service ID", mode: "Mode", workflow: "Workflow", priority: "Priority",
    valid: "Blueprint is valid and ready for draft foundation", hash: "Blueprint hash", prod: "Production", sandbox: "Sandbox", invalid: "Check required fields or Product Factory rules.", unavailable: "Preflight is temporarily unavailable.",
    note: "P4.3 permits only audited P2.1 foundation creation after an exact preflight. The created Production and Sandbox identities remain inactive; there is no publication, certification, LIVE activation or trial.",
  },
} as const;

const input = "mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-cyan-500";
const small = "rounded-xl border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100 disabled:opacity-30";
const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
const normalizeSlug = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
const makeKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const optionalRef = (value: string) => normalizeKey(value) || undefined;

export default function FactoryBlueprintWizard({ lang }: { lang: ControlPlaneLang }) {
  const copy = COPY[lang];
  const [step, setStep] = useState(0);
  const [organizationId, setOrganizationId] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [hotelName, setHotelName] = useState("");
  const [propertySlug, setPropertySlug] = useState("");
  const [publicSlug, setPublicSlug] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [timezone, setTimezone] = useState("");
  const [localesText, setLocalesText] = useState("");
  const [roomMode, setRoomMode] = useState<"range" | "explicit">("range");
  const [rangeStart, setRangeStart] = useState("1");
  const [rangeEnd, setRangeEnd] = useState("10");
  const [padTo, setPadTo] = useState("0");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [explicitRooms, setExplicitRooms] = useState("");
  const [departments, setDepartments] = useState<DepartmentDraft[]>([
    {
      key: "department-reception",
      id: "reception",
      name: "Reception",
      hoursMode: "24h",
      opensAt: "07:00",
      closesAt: "17:00",
      afterHoursDepartmentId: "",
      phone: "",
      whatsapp: "",
      email: "",
    },
  ]);
  const [integrations, setIntegrations] = useState<IntegrationDraft[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDraft[]>([]);
  const [services, setServices] = useState<ServiceDraft[]>([]);
  const [nativeSetup, setNativeSetup] = useState<NativeSetupDraft>(() => createEmptyNativeSetupDraft());
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightBlueprintJson, setPreflightBlueprintJson] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const invalidate = () => {
    setPreflight(null);
    setPreflightBlueprintJson(null);
    setFeedback(null);
  };

  const localeList = useMemo(() => localesText.split(",").map((value) => value.trim()).filter(Boolean), [localesText]);
  const explicitRoomList = useMemo(() => explicitRooms.split(/\r?\n/).map((value) => value.trim()).filter(Boolean), [explicitRooms]);
  const roomCount = roomMode === "explicit" ? new Set(explicitRoomList).size : Math.max(0, Number(rangeEnd) - Number(rangeStart) + 1);
  const departmentOptions = useMemo(() => departments.map((item) => ({ id: normalizeKey(item.id), name: item.name.trim() || item.id })).filter((item) => item.id), [departments]);
  const integrationOptions = useMemo(() => integrations.map((item) => ({ id: normalizeKey(item.id), name: item.id.trim() })).filter((item) => item.id), [integrations]);
  const workflowOptions = useMemo(() => workflows.map((item) => ({ id: normalizeKey(item.id), name: item.id.trim() })).filter((item) => item.id), [workflows]);
  const nativeBlueprint = useMemo(() => buildFactoryNativeBlueprintInput(nativeSetup, localeList), [nativeSetup, localeList]);

  const blueprint = useMemo(() => ({
    version: 1,
    organization: { id: normalizeSlug(organizationId), name: organizationName.trim() },
    property: {
      slug: normalizeSlug(propertySlug),
      publicSlug: normalizeSlug(publicSlug),
      name: hotelName.trim(),
      countryCode: countryCode.trim().toUpperCase(),
      timezone: timezone.trim(),
      locales: localeList,
      roomCount,
      roomInventory: roomMode === "range"
        ? { ranges: [{ start: Number(rangeStart), end: Number(rangeEnd), padTo: Number(padTo), prefix: prefix.trim(), suffix: suffix.trim() }] }
        : { explicit: explicitRoomList.map((number) => ({ number })) },
    },
    environment: { production: true, sandbox: true },
    departments: departments.map((department) => ({
      id: normalizeKey(department.id),
      name: department.name.trim(),
      hours: department.hoursMode === "24h" ? { is24h: true } : { open: department.opensAt, close: department.closesAt },
      afterHoursDepartmentId: optionalRef(department.afterHoursDepartmentId),
      contact: {
        phone: department.phone.trim(),
        whatsapp: department.whatsapp.trim(),
        email: department.email.trim(),
      },
    })),
    integrations: integrations.map((integration) => ({ id: normalizeKey(integration.id), kind: normalizeKey(integration.kind), adapterKey: normalizeKey(integration.adapterKey) })),
    workflows: workflows.map((workflow) => ({
      id: normalizeKey(workflow.id),
      trigger: normalizeKey(workflow.trigger || "service_request"),
      steps: workflow.steps.map((workflowStep) => ({ action: workflowStep.action, departmentId: optionalRef(workflowStep.departmentId), integrationId: optionalRef(workflowStep.integrationId) })),
    })),
    services: services.map((service) => ({
      id: normalizeKey(service.id),
      name: service.name.trim(),
      mode: service.mode,
      departmentId: optionalRef(service.departmentId),
      workflowId: optionalRef(service.workflowId),
      integrationId: optionalRef(service.integrationId),
      priorityDefault: service.priorityDefault,
    })),
    nativeContent: nativeBlueprint.nativeContent,
    venues: nativeBlueprint.venues,
  }), [organizationId, organizationName, propertySlug, publicSlug, hotelName, countryCode, timezone, localeList, roomCount, roomMode, rangeStart, rangeEnd, padTo, prefix, suffix, explicitRoomList, departments, integrations, workflows, services, nativeBlueprint]);

  const blueprintJson = JSON.stringify(blueprint);
  const preflightCurrent = Boolean(preflight?.ok && preflight?.blueprintHash && preflightBlueprintJson === blueprintJson);

  const refSelect = (value: string, onChange: (next: string) => void, options: Array<{ id: string; name: string }>) => (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={input}>
      <option value="">{copy.none}</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.name || option.id}</option>)}
    </select>
  );

  const patchDepartment = (key: string, patch: Partial<DepartmentDraft>) => { setDepartments((items) => items.map((item) => item.key === key ? { ...item, ...patch } : item)); invalidate(); };
  const patchIntegration = (key: string, patch: Partial<IntegrationDraft>) => { setIntegrations((items) => items.map((item) => item.key === key ? { ...item, ...patch } : item)); invalidate(); };
  const patchWorkflow = (key: string, patch: Partial<Omit<WorkflowDraft, "steps">>) => { setWorkflows((items) => items.map((item) => item.key === key ? { ...item, ...patch } : item)); invalidate(); };
  const patchService = (key: string, patch: Partial<ServiceDraft>) => { setServices((items) => items.map((item) => item.key === key ? { ...item, ...patch } : item)); invalidate(); };
  const patchWorkflowStep = (workflowKey: string, stepKey: string, patch: Partial<WorkflowStepDraft>) => {
    setWorkflows((items) => items.map((workflow) => workflow.key === workflowKey ? { ...workflow, steps: workflow.steps.map((workflowStep) => workflowStep.key === stepKey ? { ...workflowStep, ...patch } : workflowStep) } : workflow));
    invalidate();
  };

  function removeDepartment(key: string) {
    const removed = departments.find((item) => item.key === key);
    const id = normalizeKey(removed?.id || "");
    setDepartments((items) => items.filter((item) => item.key !== key).map((item) => normalizeKey(item.afterHoursDepartmentId) === id ? { ...item, afterHoursDepartmentId: "" } : item));
    setServices((items) => items.map((item) => normalizeKey(item.departmentId) === id ? { ...item, departmentId: "" } : item));
    setWorkflows((items) => items.map((workflow) => ({ ...workflow, steps: workflow.steps.map((workflowStep) => normalizeKey(workflowStep.departmentId) === id ? { ...workflowStep, departmentId: "" } : workflowStep) })));
    invalidate();
  }

  function removeIntegration(key: string) {
    const removed = integrations.find((item) => item.key === key);
    const id = normalizeKey(removed?.id || "");
    setIntegrations((items) => items.filter((item) => item.key !== key));
    setServices((items) => items.map((item) => normalizeKey(item.integrationId) === id ? { ...item, integrationId: "" } : item));
    setWorkflows((items) => items.map((workflow) => ({ ...workflow, steps: workflow.steps.map((workflowStep) => normalizeKey(workflowStep.integrationId) === id ? { ...workflowStep, integrationId: "" } : workflowStep) })));
    invalidate();
  }

  function removeWorkflow(key: string) {
    const removed = workflows.find((item) => item.key === key);
    const id = normalizeKey(removed?.id || "");
    setWorkflows((items) => items.filter((item) => item.key !== key));
    setServices((items) => items.map((item) => normalizeKey(item.workflowId) === id ? { ...item, workflowId: "" } : item));
    invalidate();
  }

  function canAdvance() {
    setFeedback(null);
    setPreflight(null);
    setPreflightBlueprintJson(null);
    if (step === 0 && (!organizationId || !organizationName || !hotelName || !propertySlug || !publicSlug || countryCode.trim().length !== 2 || !timezone.trim())) return false;
    if (step === 1 && (!roomCount || !localeList.length)) return false;
    if (step === 2 && (!departments.length || departments.some((item) => !item.id.trim() || !item.name.trim()))) return false;
    if (step === 3 && (integrations.some((item) => !item.id.trim() || !item.kind.trim() || !item.adapterKey.trim()) || workflows.some((item) => !item.id.trim() || !item.trigger.trim() || !item.steps.length) || services.some((item) => !item.id.trim() || !item.name.trim()))) return false;
    if (
      step === 4 &&
      (!validateNativeSetupDraft(nativeSetup, localeList) ||
        !validateCommunicationDepartments(departments))
    ) return false;
    return true;
  }

  async function runPreflight() {
    setValidating(true);
    setFeedback(null);
    setPreflight(null);
    setPreflightBlueprintJson(null);
    try {
      const response = await fetch("/api/control-plane/onboarding/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprint }),
      });
      const result = (await response.json().catch(() => ({}))) as PreflightResult;
      if (!response.ok || !result.ok) {
        setFeedback(result.error === "unavailable" ? copy.unavailable : copy.invalid);
        return;
      }
      setPreflight(result);
      setPreflightBlueprintJson(blueprintJson);
    } catch {
      setFeedback(copy.unavailable);
    } finally {
      setValidating(false);
    }
  }

  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        {copy.steps.map((label, index) => (
          <div key={label} className={`rounded-xl px-3 py-2 text-xs ${index === step ? "bg-cyan-300 text-neutral-950" : "bg-neutral-950 text-neutral-400"}`}>
            {index + 1}. {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-xl font-semibold">{copy.org}</h2>
          <label className="text-xs text-neutral-400">{copy.orgId}<input value={organizationId} onChange={(event) => { setOrganizationId(normalizeSlug(event.target.value)); invalidate(); }} className={input} /></label>
          <label className="text-xs text-neutral-400">{copy.orgName}<input value={organizationName} onChange={(event) => { setOrganizationName(event.target.value); invalidate(); }} className={input} /></label>
          <label className="text-xs text-neutral-400">{copy.hotelName}<input value={hotelName} onChange={(event) => { setHotelName(event.target.value); invalidate(); }} className={input} /></label>
          <label className="text-xs text-neutral-400">{copy.internalSlug}<input value={propertySlug} onChange={(event) => { setPropertySlug(normalizeSlug(event.target.value)); invalidate(); }} className={input} /></label>
          <label className="text-xs text-neutral-400">{copy.publicSlug}<input value={publicSlug} onChange={(event) => { setPublicSlug(normalizeSlug(event.target.value)); invalidate(); }} className={input} /></label>
          <label className="text-xs text-neutral-400">{copy.country}<input value={countryCode} onChange={(event) => { setCountryCode(event.target.value.toUpperCase().slice(0, 2)); invalidate(); }} className={input} /></label>
          <label className="text-xs text-neutral-400 sm:col-span-2">{copy.timezone}<input value={timezone} onChange={(event) => { setTimezone(event.target.value); invalidate(); }} placeholder="Europe/Berlin" className={input} /></label>
        </div>
      )}

      {step === 1 && (
        <div className="mt-6 space-y-4">
          <h2 className="text-xl font-semibold">{copy.rooms}</h2>
          <label className="text-xs text-neutral-400">{copy.locales}<input value={localesText} onChange={(event) => { setLocalesText(event.target.value); invalidate(); }} placeholder="de, en, bg" className={input} /></label>
          <label className="text-xs text-neutral-400">{copy.roomMode}<select value={roomMode} onChange={(event) => { setRoomMode(event.target.value as "range" | "explicit"); invalidate(); }} className={input}><option value="range">{copy.range}</option><option value="explicit">{copy.list}</option></select></label>
          {roomMode === "range" ? (
            <div className="grid gap-3 sm:grid-cols-5">
              <label className="text-xs text-neutral-400">{copy.start}<input value={rangeStart} onChange={(event) => { setRangeStart(event.target.value); invalidate(); }} className={input} /></label>
              <label className="text-xs text-neutral-400">{copy.end}<input value={rangeEnd} onChange={(event) => { setRangeEnd(event.target.value); invalidate(); }} className={input} /></label>
              <label className="text-xs text-neutral-400">{copy.pad}<input value={padTo} onChange={(event) => { setPadTo(event.target.value); invalidate(); }} className={input} /></label>
              <label className="text-xs text-neutral-400">{copy.prefix}<input value={prefix} onChange={(event) => { setPrefix(event.target.value); invalidate(); }} className={input} /></label>
              <label className="text-xs text-neutral-400">{copy.suffix}<input value={suffix} onChange={(event) => { setSuffix(event.target.value); invalidate(); }} className={input} /></label>
            </div>
          ) : (
            <label className="text-xs text-neutral-400">{copy.explicit}<textarea rows={7} value={explicitRooms} onChange={(event) => { setExplicitRooms(event.target.value); invalidate(); }} className={`${input} font-mono`} /></label>
          )}
          <p className="text-sm text-neutral-400">{copy.roomCount}: <strong className="text-neutral-100">{roomCount}</strong></p>
        </div>
      )}

      {step === 2 && (
        <div className="mt-6 space-y-4">
          <div className="flex justify-between gap-3">
            <h2 className="text-xl font-semibold">{copy.departments}</h2>
            <button type="button" onClick={() => { setDepartments((items) => [...items, { key: makeKey("department"), id: "", name: "", hoursMode: "window", opensAt: "07:00", closesAt: "17:00", afterHoursDepartmentId: "", phone: "", whatsapp: "", email: "" }]); invalidate(); }} className={small}>{copy.addDepartment}</button>
          </div>
          {departments.map((department) => (
            <div key={department.key} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs text-neutral-400">{copy.code}<input value={department.id} onChange={(event) => patchDepartment(department.key, { id: normalizeKey(event.target.value) })} className={input} /></label>
                <label className="text-xs text-neutral-400">{copy.name}<input value={department.name} onChange={(event) => patchDepartment(department.key, { name: event.target.value })} className={input} /></label>
                <label className="text-xs text-neutral-400">{copy.hours}<select value={department.hoursMode} onChange={(event) => patchDepartment(department.key, { hoursMode: event.target.value as "24h" | "window" })} className={input}><option value="24h">{copy.allDay}</option><option value="window">{copy.window}</option></select></label>
                <label className="text-xs text-neutral-400">{copy.afterHours}{refSelect(department.afterHoursDepartmentId, (next) => patchDepartment(department.key, { afterHoursDepartmentId: next }), departmentOptions.filter((option) => option.id !== normalizeKey(department.id)))}</label>
              </div>
              {department.hoursMode === "window" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-neutral-400">{copy.opens}<input type="time" value={department.opensAt} onChange={(event) => patchDepartment(department.key, { opensAt: event.target.value })} className={input} /></label>
                  <label className="text-xs text-neutral-400">{copy.closes}<input type="time" value={department.closesAt} onChange={(event) => patchDepartment(department.key, { closesAt: event.target.value })} className={input} /></label>
                </div>
              )}
              <button type="button" disabled={departments.length <= 1} onClick={() => removeDepartment(department.key)} className="mt-3 text-xs text-rose-300 disabled:opacity-30">{copy.remove}</button>
            </div>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="mt-6 space-y-6">
          <h2 className="text-xl font-semibold">{copy.operations}</h2>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="font-semibold">{copy.integrations}</h3><p className="mt-1 text-xs text-neutral-400">{copy.integrationsHelp}</p></div>
              <button type="button" onClick={() => { setIntegrations((items) => [...items, { key: makeKey("integration"), id: "", kind: "", adapterKey: "" }]); invalidate(); }} className={small}>{copy.addIntegration}</button>
            </div>
            <div className="mt-4 space-y-3">
              {integrations.map((integration) => (
                <div key={integration.key} className="grid gap-3 rounded-xl border border-neutral-800 p-3 sm:grid-cols-4">
                  <label className="text-xs text-neutral-400">{copy.integrationId}<input value={integration.id} onChange={(event) => patchIntegration(integration.key, { id: normalizeKey(event.target.value) })} className={input} /></label>
                  <label className="text-xs text-neutral-400">{copy.kind}<input value={integration.kind} onChange={(event) => patchIntegration(integration.key, { kind: normalizeKey(event.target.value) })} placeholder="pms" className={input} /></label>
                  <label className="text-xs text-neutral-400">{copy.adapterKey}<input value={integration.adapterKey} onChange={(event) => patchIntegration(integration.key, { adapterKey: normalizeKey(event.target.value) })} placeholder="generic-pms" className={input} /></label>
                  <div className="flex items-end"><button type="button" onClick={() => removeIntegration(integration.key)} className="pb-2 text-xs text-rose-300">{copy.remove}</button></div>
                </div>
              ))}
              {!integrations.length && <p className="text-xs text-neutral-500">{copy.none}</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="font-semibold">{copy.workflows}</h3><p className="mt-1 text-xs text-neutral-400">{copy.workflowsHelp}</p></div>
              <button type="button" onClick={() => { setWorkflows((items) => [...items, { key: makeKey("workflow"), id: "", trigger: "service_request", steps: [{ key: makeKey("workflow-step"), action: "assign", departmentId: "", integrationId: "" }] }]); invalidate(); }} className={small}>{copy.addWorkflow}</button>
            </div>
            <div className="mt-4 space-y-4">
              {workflows.map((workflow) => (
                <div key={workflow.key} className="rounded-xl border border-neutral-800 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-neutral-400">{copy.workflowId}<input value={workflow.id} onChange={(event) => patchWorkflow(workflow.key, { id: normalizeKey(event.target.value) })} className={input} /></label>
                    <label className="text-xs text-neutral-400">{copy.trigger}<input value={workflow.trigger} onChange={(event) => patchWorkflow(workflow.key, { trigger: normalizeKey(event.target.value) })} className={input} /></label>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-neutral-300">{copy.stepsLabel}</p>
                    <button type="button" onClick={() => { setWorkflows((items) => items.map((item) => item.key === workflow.key ? { ...item, steps: [...item.steps, { key: makeKey("workflow-step"), action: "notification", departmentId: "", integrationId: "" }] } : item)); invalidate(); }} className={small}>{copy.addStep}</button>
                  </div>
                  <div className="mt-2 space-y-2">
                    {workflow.steps.map((workflowStep, index) => (
                      <div key={workflowStep.key} className="grid gap-2 rounded-xl bg-neutral-900 p-3 sm:grid-cols-4">
                        <label className="text-xs text-neutral-400">{index + 1}. {copy.action}<select value={workflowStep.action} onChange={(event) => patchWorkflowStep(workflow.key, workflowStep.key, { action: event.target.value as WorkflowAction })} className={input}>{WORKFLOW_ACTIONS.map((action) => <option key={action} value={action}>{action}</option>)}</select></label>
                        <label className="text-xs text-neutral-400">{copy.department}{refSelect(workflowStep.departmentId, (next) => patchWorkflowStep(workflow.key, workflowStep.key, { departmentId: next }), departmentOptions)}</label>
                        <label className="text-xs text-neutral-400">{copy.integration}{refSelect(workflowStep.integrationId, (next) => patchWorkflowStep(workflow.key, workflowStep.key, { integrationId: next }), integrationOptions)}</label>
                        <div className="flex items-end"><button type="button" disabled={workflow.steps.length <= 1} onClick={() => { setWorkflows((items) => items.map((item) => item.key === workflow.key && item.steps.length > 1 ? { ...item, steps: item.steps.filter((candidate) => candidate.key !== workflowStep.key) } : item)); invalidate(); }} className="pb-2 text-xs text-rose-300 disabled:opacity-30">{copy.remove}</button></div>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => removeWorkflow(workflow.key)} className="mt-3 text-xs text-rose-300">{copy.remove}</button>
                </div>
              ))}
              {!workflows.length && <p className="text-xs text-neutral-500">{copy.none}</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="font-semibold">{copy.services}</h3><p className="mt-1 text-xs text-neutral-400">{copy.servicesHelp}</p></div>
              <button type="button" onClick={() => { setServices((items) => [...items, { key: makeKey("service"), id: "", name: "", mode: "configurable", departmentId: "", workflowId: "", integrationId: "", priorityDefault: "normal" }]); invalidate(); }} className={small}>{copy.addService}</button>
            </div>
            <div className="mt-4 space-y-3">
              {services.map((service) => (
                <div key={service.key} className="rounded-xl border border-neutral-800 p-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-xs text-neutral-400">{copy.serviceId}<input value={service.id} onChange={(event) => patchService(service.key, { id: normalizeKey(event.target.value) })} className={input} /></label>
                    <label className="text-xs text-neutral-400">{copy.name}<input value={service.name} onChange={(event) => patchService(service.key, { name: event.target.value })} className={input} /></label>
                    <label className="text-xs text-neutral-400">{copy.mode}<select value={service.mode} onChange={(event) => patchService(service.key, { mode: event.target.value as ServiceMode })} className={input}>{SERVICE_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
                    <label className="text-xs text-neutral-400">{copy.priority}<select value={service.priorityDefault} onChange={(event) => patchService(service.key, { priorityDefault: event.target.value as ServicePriority })} className={input}>{SERVICE_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
                    <label className="text-xs text-neutral-400">{copy.department}{refSelect(service.departmentId, (next) => patchService(service.key, { departmentId: next }), departmentOptions)}</label>
                    <label className="text-xs text-neutral-400">{copy.workflow}{refSelect(service.workflowId, (next) => patchService(service.key, { workflowId: next }), workflowOptions)}</label>
                    <label className="text-xs text-neutral-400">{copy.integration}{refSelect(service.integrationId, (next) => patchService(service.key, { integrationId: next }), integrationOptions)}</label>
                  </div>
                  <button type="button" onClick={() => { setServices((items) => items.filter((item) => item.key !== service.key)); invalidate(); }} className="mt-3 text-xs text-rose-300">{copy.remove}</button>
                </div>
              ))}
              {!services.length && <p className="text-xs text-neutral-500">{copy.none}</p>}
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-8">
          <FactoryNativeContentStep
            lang={lang}
            locales={localeList}
            value={nativeSetup}
            onChange={(next) => { setNativeSetup(next); invalidate(); }}
          />
          <FactoryCommunicationsStep
            lang={lang}
            departments={departments}
            onPatch={(key, patch) => patchDepartment(key, patch)}
          />
        </div>
      )}

      {step === 5 && (
        <div className="mt-6 space-y-4">
          <h2 className="text-xl font-semibold">{copy.review}</h2>
          <pre className="max-h-96 overflow-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-300">{JSON.stringify(blueprint, null, 2)}</pre>
          <button type="button" onClick={runPreflight} disabled={validating} className="w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100">{validating ? copy.validating : copy.validate}</button>
          {preflightCurrent && preflight?.identities && preflight.blueprintHash && (
            <>
              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-4 text-sm">
                <p className="font-semibold text-emerald-100">{copy.valid}</p>
                <p className="mt-2 break-all text-xs text-neutral-400">{copy.hash}: {preflight.blueprintHash}</p>
                <p className="mt-2">{copy.prod}: {preflight.identities.productionSlug} · {preflight.identities.productionPublicSlug}</p>
                <p>{copy.sandbox}: {preflight.identities.sandboxSlug} · {preflight.identities.sandboxPublicSlug}</p>
              </div>
              <FactoryFoundationCreatePanel lang={lang} blueprint={blueprint} expectedBlueprintHash={preflight.blueprintHash} productionSlug={preflight.identities.productionSlug} sandboxSlug={preflight.identities.sandboxSlug} />
            </>
          )}
          <p className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs leading-5 text-amber-100">{copy.note}</p>
        </div>
      )}

      {feedback && <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-100">{feedback}</p>}
      <div className="mt-6 flex justify-between gap-3">
        <button type="button" disabled={step === 0} onClick={() => { setFeedback(null); setStep((value) => Math.max(0, value - 1)); }} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm disabled:opacity-30">{copy.back}</button>
        {step < LAST_STEP && <button type="button" onClick={() => { if (canAdvance()) setStep((value) => Math.min(LAST_STEP, value + 1)); else setFeedback(copy.invalid); }} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-2 text-sm font-semibold text-cyan-100">{copy.next}</button>}
      </div>
    </section>
  );
}
