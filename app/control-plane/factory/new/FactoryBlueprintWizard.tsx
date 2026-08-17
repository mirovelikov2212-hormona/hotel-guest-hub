"use client";

import { useMemo, useState } from "react";
import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

type DepartmentDraft = {
  key: string;
  id: string;
  name: string;
  hoursMode: "24h" | "window";
  opensAt: string;
  closesAt: string;
  afterHoursDepartmentId: string;
};

type PreflightResult = {
  ok?: boolean;
  error?: string;
  blueprintHash?: string;
  identities?: { productionSlug: string; productionPublicSlug: string; sandboxSlug: string; sandboxPublicSlug: string };
};

const COPY = {
  bg: {
    steps: ["Организация и хотел", "Стаи и езици", "Отдели", "Преглед и preflight"],
    next: "Напред", back: "Назад", validate: "Валидирай blueprint", validating: "Валидиране…",
    org: "Организация и хотел", rooms: "Стаи и езици", departments: "Отдели", review: "Преглед и preflight",
    orgId: "Organization ID / slug", orgName: "Име на организацията", hotelName: "Име на хотела",
    internalSlug: "Вътрешен hotel slug", publicSlug: "Публичен slug", country: "Държава (ISO 2)", timezone: "IANA timezone",
    roomMode: "Начин за стаите", range: "Диапазон", list: "Списък", start: "Начало", end: "Край", pad: "Минимални цифри",
    prefix: "Префикс", suffix: "Суфикс", explicit: "Стаи — по една на ред", locales: "Езици / locales — разделени със запетая",
    addDepartment: "+ Добави отдел", code: "Код", name: "Име", hours: "Работно време", allDay: "24 часа", window: "Часови диапазон",
    opens: "Отваря", closes: "Затваря", afterHours: "След работно време към", none: "— няма —", remove: "Премахни",
    valid: "Blueprint-ът е валиден", hash: "Blueprint hash", prod: "Production", sandbox: "Sandbox",
    invalid: "Провери задължителните полета или Product Factory правилата.", unavailable: "Preflight временно не е достъпен.",
    note: "P4.1 не създава хотел. P4.2 ще добави services/workflows/integrations към този blueprint; едва след complete blueprint ще разрешим реалния onboarding.",
  },
  en: {
    steps: ["Organization & hotel", "Rooms & locales", "Departments", "Review & preflight"],
    next: "Next", back: "Back", validate: "Validate blueprint", validating: "Validating…",
    org: "Organization & hotel", rooms: "Rooms & locales", departments: "Departments", review: "Review & preflight",
    orgId: "Organization ID / slug", orgName: "Organization name", hotelName: "Hotel name",
    internalSlug: "Internal hotel slug", publicSlug: "Public slug", country: "Country (ISO 2)", timezone: "IANA timezone",
    roomMode: "Room input mode", range: "Range", list: "List", start: "Start", end: "End", pad: "Minimum digits",
    prefix: "Prefix", suffix: "Suffix", explicit: "Rooms — one per line", locales: "Languages / locales — comma separated",
    addDepartment: "+ Add department", code: "Code", name: "Name", hours: "Hours", allDay: "24 hours", window: "Time window",
    opens: "Opens", closes: "Closes", afterHours: "After hours to", none: "— none —", remove: "Remove",
    valid: "Blueprint is valid", hash: "Blueprint hash", prod: "Production", sandbox: "Sandbox",
    invalid: "Check required fields or Product Factory rules.", unavailable: "Preflight is temporarily unavailable.",
    note: "P4.1 does not create a hotel. P4.2 will add services/workflows/integrations to this blueprint; real onboarding is enabled only after the blueprint is complete.",
  },
} as const;

const input = "mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-cyan-500";
const normalizeSlug = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
const makeKey = () => `department-${crypto.randomUUID()}`;

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
    { key: "department-reception", id: "reception", name: "Reception", hoursMode: "24h", opensAt: "07:00", closesAt: "17:00", afterHoursDepartmentId: "" },
  ]);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const localeList = useMemo(() => localesText.split(",").map((value) => value.trim()).filter(Boolean), [localesText]);
  const explicitRoomList = useMemo(() => explicitRooms.split(/\r?\n/).map((value) => value.trim()).filter(Boolean), [explicitRooms]);
  const roomCount = roomMode === "explicit"
    ? new Set(explicitRoomList).size
    : Math.max(0, Number(rangeEnd) - Number(rangeStart) + 1);

  const blueprint = useMemo(() => {
    const roomInventory = roomMode === "range"
      ? { ranges: [{ start: Number(rangeStart), end: Number(rangeEnd), padTo: Number(padTo), prefix: prefix.trim(), suffix: suffix.trim() }] }
      : { explicit: explicitRoomList.map((number) => ({ number })) };
    return {
      version: 1,
      organization: { id: normalizeSlug(organizationId), name: organizationName.trim() },
      property: {
        slug: normalizeSlug(propertySlug), publicSlug: normalizeSlug(publicSlug), name: hotelName.trim(),
        countryCode: countryCode.trim().toUpperCase(), timezone: timezone.trim(), locales: localeList,
        roomCount, roomInventory,
      },
      environment: { production: true, sandbox: true },
      departments: departments.map((department) => ({
        id: department.id.trim().toLowerCase(), name: department.name.trim(),
        hours: department.hoursMode === "24h" ? { is24h: true } : { open: department.opensAt, close: department.closesAt },
        afterHoursDepartmentId: department.afterHoursDepartmentId.trim() || undefined,
      })),
      integrations: [], workflows: [], services: [],
    };
  }, [organizationId, organizationName, propertySlug, publicSlug, hotelName, countryCode, timezone, localeList, roomCount, roomMode, rangeStart, rangeEnd, padTo, prefix, suffix, explicitRoomList, departments]);

  function addDepartment() {
    setDepartments((items) => [...items, { key: makeKey(), id: "", name: "", hoursMode: "window", opensAt: "07:00", closesAt: "17:00", afterHoursDepartmentId: "" }]);
    setPreflight(null);
  }
  function removeDepartment(key: string) {
    setDepartments((items) => items.filter((item) => item.key !== key));
    setPreflight(null);
  }
  function patchDepartment(key: string, patch: Partial<DepartmentDraft>) {
    setDepartments((items) => items.map((item) => item.key === key ? { ...item, ...patch } : item));
    setPreflight(null);
  }

  function canAdvance() {
    setFeedback(null); setPreflight(null);
    if (step === 0 && (!organizationId || !organizationName || !hotelName || !propertySlug || !publicSlug || countryCode.trim().length !== 2 || !timezone.trim())) return false;
    if (step === 1 && (!roomCount || !localeList.length)) return false;
    if (step === 2 && (!departments.length || departments.some((item) => !item.id.trim() || !item.name.trim()))) return false;
    return true;
  }

  async function runPreflight() {
    setValidating(true); setFeedback(null); setPreflight(null);
    try {
      const response = await fetch("/api/control-plane/onboarding/preflight", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blueprint }),
      });
      const result = (await response.json().catch(() => ({}))) as PreflightResult;
      if (!response.ok || !result.ok) { setFeedback(result.error === "unavailable" ? copy.unavailable : copy.invalid); return; }
      setPreflight(result);
    } catch { setFeedback(copy.unavailable); } finally { setValidating(false); }
  }

  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
      <div className="grid gap-2 sm:grid-cols-4">
        {copy.steps.map((label, index) => <div key={label} className={`rounded-xl px-3 py-2 text-xs ${index === step ? "bg-cyan-300 text-neutral-950" : "bg-neutral-950 text-neutral-400"}`}>{index + 1}. {label}</div>)}
      </div>

      {step === 0 && <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-xl font-semibold">{copy.org}</h2>
        {[
          [copy.orgId, organizationId, (v:string)=>setOrganizationId(normalizeSlug(v))],
          [copy.orgName, organizationName, setOrganizationName], [copy.hotelName, hotelName, setHotelName],
          [copy.internalSlug, propertySlug, (v:string)=>setPropertySlug(normalizeSlug(v))],
          [copy.publicSlug, publicSlug, (v:string)=>setPublicSlug(normalizeSlug(v))],
          [copy.country, countryCode, (v:string)=>setCountryCode(v.toUpperCase().slice(0,2))],
        ].map(([label, value, setter]) => <label key={String(label)} className="text-xs text-neutral-400">{label}<input value={value as string} onChange={(e)=>(setter as (v:string)=>void)(e.target.value)} className={input}/></label>)}
        <label className="text-xs text-neutral-400 sm:col-span-2">{copy.timezone}<input value={timezone} onChange={(e)=>setTimezone(e.target.value)} placeholder="Europe/Berlin" className={input}/></label>
      </div>}

      {step === 1 && <div className="mt-6 space-y-4">
        <h2 className="text-xl font-semibold">{copy.rooms}</h2>
        <label className="text-xs text-neutral-400">{copy.locales}<input value={localesText} onChange={(e)=>setLocalesText(e.target.value)} placeholder="de, en, bg" className={input}/></label>
        <label className="text-xs text-neutral-400">{copy.roomMode}<select value={roomMode} onChange={(e)=>setRoomMode(e.target.value as "range" | "explicit")} className={input}><option value="range">{copy.range}</option><option value="explicit">{copy.list}</option></select></label>
        {roomMode === "range" ? <div className="grid gap-3 sm:grid-cols-5">
          {[[copy.start,rangeStart,setRangeStart],[copy.end,rangeEnd,setRangeEnd],[copy.pad,padTo,setPadTo],[copy.prefix,prefix,setPrefix],[copy.suffix,suffix,setSuffix]].map(([label,value,setter])=><label key={String(label)} className="text-xs text-neutral-400">{label}<input value={value as string} onChange={(e)=>(setter as (v:string)=>void)(e.target.value)} className={input}/></label>)}
        </div> : <label className="text-xs text-neutral-400">{copy.explicit}<textarea rows={7} value={explicitRooms} onChange={(e)=>setExplicitRooms(e.target.value)} className={`${input} font-mono`}/></label>}
        <p className="text-sm text-neutral-400">Room count: <strong className="text-neutral-100">{roomCount}</strong></p>
      </div>}

      {step === 2 && <div className="mt-6 space-y-4">
        <div className="flex justify-between gap-3"><h2 className="text-xl font-semibold">{copy.departments}</h2><button type="button" onClick={addDepartment} className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100">{copy.addDepartment}</button></div>
        {departments.map((department)=><div key={department.key} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-neutral-400">{copy.code}<input value={department.id} onChange={(e)=>patchDepartment(department.key,{id:e.target.value.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9_-]/g,"")})} className={input}/></label>
            <label className="text-xs text-neutral-400">{copy.name}<input value={department.name} onChange={(e)=>patchDepartment(department.key,{name:e.target.value})} className={input}/></label>
            <label className="text-xs text-neutral-400">{copy.hours}<select value={department.hoursMode} onChange={(e)=>patchDepartment(department.key,{hoursMode:e.target.value as "24h"|"window"})} className={input}><option value="24h">{copy.allDay}</option><option value="window">{copy.window}</option></select></label>
            <label className="text-xs text-neutral-400">{copy.afterHours}<select value={department.afterHoursDepartmentId} onChange={(e)=>patchDepartment(department.key,{afterHoursDepartmentId:e.target.value})} className={input}><option value="">{copy.none}</option>{departments.filter((x)=>x.key!==department.key&&x.id).map((x)=><option key={x.key} value={x.id}>{x.name||x.id}</option>)}</select></label>
          </div>
          {department.hoursMode === "window" && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs text-neutral-400">{copy.opens}<input type="time" value={department.opensAt} onChange={(e)=>patchDepartment(department.key,{opensAt:e.target.value})} className={input}/></label><label className="text-xs text-neutral-400">{copy.closes}<input type="time" value={department.closesAt} onChange={(e)=>patchDepartment(department.key,{closesAt:e.target.value})} className={input}/></label></div>}
          <button type="button" disabled={departments.length<=1} onClick={()=>removeDepartment(department.key)} className="mt-3 text-xs text-rose-300 disabled:opacity-30">{copy.remove}</button>
        </div>)}
      </div>}

      {step === 3 && <div className="mt-6 space-y-4">
        <h2 className="text-xl font-semibold">{copy.review}</h2>
        <pre className="max-h-96 overflow-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-300">{JSON.stringify(blueprint,null,2)}</pre>
        <button type="button" onClick={runPreflight} disabled={validating} className="w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100">{validating?copy.validating:copy.validate}</button>
        {preflight?.ok && preflight.identities && <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-4 text-sm"><p className="font-semibold text-emerald-100">{copy.valid}</p><p className="mt-2 break-all text-xs text-neutral-400">{copy.hash}: {preflight.blueprintHash}</p><p className="mt-2">{copy.prod}: {preflight.identities.productionSlug} · {preflight.identities.productionPublicSlug}</p><p>{copy.sandbox}: {preflight.identities.sandboxSlug} · {preflight.identities.sandboxPublicSlug}</p></div>}
        <p className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs leading-5 text-amber-100">{copy.note}</p>
      </div>}

      {feedback && <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-100">{feedback}</p>}
      <div className="mt-6 flex justify-between gap-3"><button type="button" disabled={step===0} onClick={()=>{setFeedback(null);setStep((v)=>Math.max(0,v-1));}} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm disabled:opacity-30">{copy.back}</button>{step<3&&<button type="button" onClick={()=>{if(canAdvance())setStep((v)=>Math.min(3,v+1));else setFeedback(copy.invalid);}} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-2 text-sm font-semibold text-cyan-100">{copy.next}</button>}</div>
    </section>
  );
}
