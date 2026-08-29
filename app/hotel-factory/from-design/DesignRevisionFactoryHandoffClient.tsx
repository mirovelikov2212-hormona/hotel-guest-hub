"use client";

import { useEffect, useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import {
  FACTORY_STANDARD_CATALOG_VERSION,
  FACTORY_STANDARD_CORE_SERVICES,
} from "@/lib/product-factory/factory-standard-catalog.mjs";
import { FACTORY_COMMON_LANGUAGE_OPTIONS } from "@/lib/product-factory/factory-language-options.mjs";

type DepartmentId = "reception" | "housekeeping" | "maintenance" | "restaurant" | "spa";
type Handoff = {
  schemaVersion: "hub-design-factory-handoff-v1";
  workspaceId: string;
  revisionId: string;
  revisionNo: number;
  payloadChecksum: string;
  sourcePackageChecksum: string;
  canonicalUrl: string;
  hotelName: string;
  isCurrentRevision: boolean;
  revisionSchemaVersion: string;
};
type LocationAuthority = {
  query: string;
  displayName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  countryCode: string;
  provider: "google_maps" | "open_meteo";
};
type Preflight = { ok?: boolean; error?: string; blueprintHash?: string; identities?: Record<string, string> };
type Created = { ok?: boolean; error?: string; onboardingRunId?: string; productionHotelId?: string; sandboxHotelId?: string; propertyId?: string };

const DEPARTMENTS: Array<{ id: DepartmentId; label: string }> = [
  { id: "reception", label: "Reception" },
  { id: "housekeeping", label: "Housekeeping" },
  { id: "maintenance", label: "Maintenance" },
  { id: "restaurant", label: "Restaurant" },
  { id: "spa", label: "SPA" },
];
const DEFAULT_DEPARTMENTS: DepartmentId[] = ["reception", "housekeeping", "maintenance"];
const COUNTRIES = ["BG", "DE", "GR", "TR", "ES", "RO", "CZ", "AT", "CH", "FR", "IT", "NL", "PL", "GB"];
const slugify = (value: string) => value.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-hotel$/, "");

export default function DesignRevisionFactoryHandoffClient({ lang, workspaceId, revisionId }: { lang: ControlPlaneLang; workspaceId: string; revisionId: string }) {
  const bg = lang === "bg";
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hotelName, setHotelName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [location, setLocation] = useState<LocationAuthority | null>(null);
  const [roomsText, setRoomsText] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [departments, setDepartments] = useState<DepartmentId[]>(DEFAULT_DEPARTMENTS);
  const [services, setServices] = useState<string[]>([]);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [preflightJson, setPreflightJson] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [idempotencyKey] = useState(() => `design-handoff:${crypto.randomUUID()}`);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/control-plane/design-studio/factory-handoff?workspaceId=${encodeURIComponent(workspaceId)}&revisionId=${encodeURIComponent(revisionId)}`, { cache: "no-store" });
        const body = await response.json() as { ok?: boolean; error?: string; handoff?: Handoff };
        if (!response.ok || !body.ok || !body.handoff) throw new Error(body.error || "handoff_load_failed");
        if (!cancelled) {
          setHandoff(body.handoff);
          setHotelName(body.handoff.hotelName);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [workspaceId, revisionId]);

  useEffect(() => {
    const recommended = FACTORY_STANDARD_CORE_SERVICES
      .filter((service) => departments.includes(service.departmentId as DepartmentId) && service.starterDefault === true)
      .map((service) => service.id);
    setServices((current) => [...new Set([...current.filter((id) => FACTORY_STANDARD_CORE_SERVICES.some((service) => service.id === id && departments.includes(service.departmentId as DepartmentId))), ...recommended])]);
  }, [departments]);

  const rooms = useMemo(() => [...new Set(roomsText.split(/\r?\n|,/).map((value) => value.trim().replace(/\s+/g, "")).filter(Boolean))], [roomsText]);
  const slug = slugify(hotelName);

  const blueprint = useMemo(() => {
    if (!handoff || !location) return null;
    return {
      version: 1,
      organization: { id: slug ? `${slug}-org` : "", name: hotelName.trim() },
      property: {
        slug,
        publicSlug: slug,
        name: hotelName.trim(),
        countryCode,
        timezone: location.timezone,
        location: {
          query: locationQuery.trim(),
          displayName: location.displayName,
          latitude: location.latitude,
          longitude: location.longitude,
          lat: location.latitude,
          lng: location.longitude,
        },
        locales: languages,
        roomCount: rooms.length,
        roomInventory: { explicit: rooms.map((number) => ({ number })) },
      },
      environment: { production: true, sandbox: true },
      departments: departments.map((id) => {
        if (id === "reception") return { id, name: "Reception", hours: { is24h: true } };
        if (id === "housekeeping") return { id, name: "Housekeeping", hours: { open: "07:00", close: "17:00" }, afterHoursDepartmentId: "reception" };
        if (id === "maintenance") return { id, name: "Maintenance", hours: { open: "07:00", close: "17:00" }, afterHoursDepartmentId: "reception" };
        if (id === "restaurant") return { id, name: "Restaurant", hours: { open: "07:00", close: "22:00" } };
        return { id, name: "SPA", hours: { open: "09:00", close: "20:00" } };
      }),
      integrations: [],
      workflows: [],
      services: FACTORY_STANDARD_CORE_SERVICES.filter((service) => services.includes(service.id) && departments.includes(service.departmentId as DepartmentId)).map((service) => ({
        id: service.id,
        name: service.title.en,
        mode: "configurable",
        departmentId: service.departmentId,
        priorityDefault: "normal",
        catalogRef: service.id,
        catalogVersion: FACTORY_STANDARD_CATALOG_VERSION,
        title: { ...service.title },
        description: { ...service.description },
        staffLabel: { ...service.staffLabel },
        success: { ...service.success },
        requestKind: service.requestKind || "standard",
        requiresNote: Boolean(service.requiresNote),
        requiresQuantity: Boolean(service.requiresQuantity),
        ...(typeof service.minQty === "number" ? { minQty: service.minQty } : {}),
        ...(typeof service.maxQty === "number" ? { maxQty: service.maxQty } : {}),
        requiresTime: Boolean(service.requiresTime),
        timeMode: service.timeMode || "none",
        aiVisible: Boolean(service.aiVisible),
        intentTags: [...(service.intentTags || [service.id])],
      })),
      designHandoff: {
        schemaVersion: "hub-design-factory-handoff-v1",
        workspaceId: handoff.workspaceId,
        revisionId: handoff.revisionId,
        revisionNo: handoff.revisionNo,
        revisionSchemaVersion: handoff.revisionSchemaVersion,
        payloadChecksum: handoff.payloadChecksum,
        sourcePackageChecksum: handoff.sourcePackageChecksum,
        canonicalUrl: handoff.canonicalUrl,
        reviewedAtFactory: true,
        materializationPolicy: "sandbox_first_explicit_review",
        liveActivation: false,
      },
    };
  }, [handoff, location, slug, hotelName, countryCode, locationQuery, languages, rooms, departments, services]);

  const blueprintJson = blueprint ? JSON.stringify(blueprint) : "";
  const preflightCurrent = Boolean(preflight?.ok && preflight?.blueprintHash && preflightJson === blueprintJson);
  const valid = Boolean(handoff && hotelName.trim() && slug && countryCode && location && rooms.length && languages.length && departments.includes("reception"));

  function invalidate() { setPreflight(null); setPreflightJson(""); setConfirmed(false); setCreated(null); }

  async function resolveLocation() {
    if (!countryCode || !locationQuery.trim()) return;
    setBusy(true); setError(""); invalidate();
    try {
      const response = await fetch("/api/control-plane/onboarding/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: locationQuery.trim(), countryCode }) });
      const body = await response.json() as { ok?: boolean; error?: string; location?: LocationAuthority };
      if (!response.ok || !body.ok || !body.location) throw new Error(body.error || "location_not_found");
      setLocation(body.location);
      if (body.location.countryCode) setCountryCode(body.location.countryCode);
    } catch (reason) { setLocation(null); setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function runPreflight() {
    if (!valid || !blueprint) return;
    setBusy(true); setError(""); setPreflight(null); setConfirmed(false);
    try {
      const response = await fetch("/api/control-plane/onboarding/preflight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blueprint }) });
      const body = await response.json() as Preflight;
      if (!response.ok || !body.ok || !body.blueprintHash) throw new Error(body.error || "preflight_failed");
      setPreflight(body); setPreflightJson(blueprintJson);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function createFoundation() {
    if (!confirmed || !preflightCurrent || !preflight?.blueprintHash || !blueprint) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/control-plane/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          expectedBlueprintHash: preflight.blueprintHash,
          approval: {
            createDraftTenant: true,
            keepProductionInactive: true,
            keepSandboxInactive: true,
            publishRevision: false,
            activateLive: false,
          },
          blueprint,
        }),
      });
      const body = await response.json() as Created;
      if (!response.ok || !body.ok) throw new Error(body.error || "factory_create_failed");
      setCreated(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  if (loading) return <section className="rounded-[2rem] border border-white/10 bg-neutral-900/70 p-6 text-sm text-neutral-400">Loading exact revision…</section>;
  if (!handoff) return <section className="rounded-[2rem] border border-rose-300/20 bg-neutral-900/70 p-6 text-sm text-rose-200">{error || "Design revision unavailable"}</section>;

  return (
    <section className="rounded-[2rem] border border-white/10 bg-neutral-900/70 p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.025] p-4">
            <p className="text-sm font-semibold text-violet-100">Immutable design source · revision {handoff.revisionNo}</p>
            <p className="mt-2 text-xs text-neutral-500">{handoff.canonicalUrl}</p>
            <p className="mt-2 font-mono text-[10px] text-neutral-600">payload {handoff.payloadChecksum}<br />source {handoff.sourcePackageChecksum}</p>
            {!handoff.isCurrentRevision && <p className="mt-2 text-xs text-amber-200">{bg ? "Внимание: избраната revision вече не е текущата. Тя остава валидна immutable revision, но прегледай избора." : "Warning: this revision is no longer current. It remains an immutable valid revision, but review your choice."}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={bg ? "Име на хотела" : "Hotel name"} value={hotelName} onChange={(value) => { setHotelName(value); invalidate(); }} />
            <Select label={bg ? "Държава" : "Country"} value={countryCode} onChange={(value) => { setCountryCode(value); setLocation(null); invalidate(); }} options={[{ value: "", label: bg ? "Избери" : "Choose" }, ...COUNTRIES.map((code) => ({ value: code, label: code }))]} />
          </div>

          <div className="rounded-2xl border border-cyan-300/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">{bg ? "Потвърдена локация" : "Verified location"}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={locationQuery} onChange={(event) => { setLocationQuery(event.target.value); setLocation(null); invalidate(); }} placeholder="Hotel / address / city" className="min-h-11 flex-1 rounded-xl border border-white/10 bg-neutral-950 px-3 text-sm" /><button type="button" onClick={resolveLocation} disabled={busy || !countryCode || !locationQuery.trim()} className="rounded-xl border border-cyan-300/20 px-4 text-xs text-cyan-100 disabled:opacity-40">{bg ? "Намери" : "Resolve"}</button></div>
            {location && <p className="mt-3 text-xs text-emerald-200">✓ {location.displayName} · {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)} · {location.timezone}</p>}
          </div>

          <label className="block text-xs text-neutral-400">{bg ? "Стаи — по една на ред" : "Rooms — one per line"}<textarea value={roomsText} onChange={(event) => { setRoomsText(event.target.value); invalidate(); }} rows={5} placeholder="101\n102\n103" className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 p-3 text-sm" /><span className="mt-1 block text-[10px] text-neutral-600">{rooms.length} rooms</span></label>

          <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">{bg ? "Guest езици" : "Guest languages"}</p><div className="mt-3 flex flex-wrap gap-2">{FACTORY_COMMON_LANGUAGE_OPTIONS.map((item) => { const active = languages.includes(item.code); return <button key={item.code} type="button" onClick={() => { setLanguages((current) => active ? current.filter((code) => code !== item.code) : [...current, item.code]); invalidate(); }} className={`min-h-11 rounded-xl border px-3 text-xs ${active ? "border-cyan-300/25 text-cyan-100" : "border-white/5 text-neutral-500"}`}>{item.nativeName}</button>; })}</div></div>

          <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">{bg ? "Екипи" : "Teams"}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{DEPARTMENTS.map((department) => { const active = departments.includes(department.id); return <button key={department.id} type="button" disabled={department.id === "reception"} onClick={() => { setDepartments((current) => active ? current.filter((id) => id !== department.id) : [...current, department.id]); invalidate(); }} className={`min-h-14 rounded-xl border p-3 text-left text-xs ${active ? "border-emerald-300/20 text-emerald-100" : "border-white/5 text-neutral-600"}`}>{active ? "✓ " : ""}{department.label}</button>; })}</div></div>

          <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">{bg ? "Starter услуги" : "Starter services"}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{FACTORY_STANDARD_CORE_SERVICES.filter((service) => departments.includes(service.departmentId as DepartmentId)).map((service) => { const active = services.includes(service.id); return <button key={service.id} type="button" onClick={() => { setServices((current) => active ? current.filter((id) => id !== service.id) : [...current, service.id]); invalidate(); }} className={`min-h-14 rounded-xl border p-3 text-left text-xs ${active ? "border-violet-300/20 text-violet-100" : "border-white/5 text-neutral-600"}`}>{active ? "✓ " : ""}{service.title[lang] || service.title.en}</button>; })}</div></div>
        </div>

        <aside className="h-fit rounded-2xl border border-emerald-300/15 bg-black/20 p-4 lg:sticky lg:top-4">
          <p className="text-sm font-semibold text-emerald-100">{bg ? "Factory safety gate" : "Factory safety gate"}</p>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-neutral-400"><li>• exact immutable design checksum</li><li>• verified location + timezone</li><li>• explicit room inventory</li><li>• Production inactive</li><li>• Sandbox inactive</li><li>• no publication</li><li>• no LIVE activation</li></ul>
          <button type="button" onClick={runPreflight} disabled={busy || !valid} className="mt-5 min-h-11 w-full rounded-xl border border-cyan-300/20 px-4 text-xs font-semibold text-cyan-100 disabled:opacity-40">{busy ? "…" : bg ? "Провери конфигурацията" : "Run preflight"}</button>
          {preflightCurrent && <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-neutral-300"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />{bg ? "Потвърждавам Sandbox-first създаване. Production и Sandbox остават неактивни." : "I confirm Sandbox-first creation. Production and Sandbox remain inactive."}</label>}
          <button type="button" onClick={createFoundation} disabled={busy || !confirmed || !preflightCurrent} className="mt-4 min-h-11 w-full rounded-xl border border-emerald-300/25 bg-emerald-300/[0.06] px-4 text-xs font-semibold text-emerald-100 disabled:opacity-40">{bg ? "Създай Factory foundation" : "Create Factory foundation"}</button>
          {preflightCurrent && <p className="mt-3 font-mono text-[9px] text-neutral-600">blueprint {preflight?.blueprintHash}</p>}
          {error && <p className="mt-3 text-xs text-rose-200">{error}</p>}
          {created?.ok && <div className="mt-4 rounded-xl border border-emerald-300/20 p-3 text-xs text-emerald-100"><p className="font-semibold">✓ {bg ? "Foundation създаден" : "Foundation created"}</p><p className="mt-2 font-mono text-[9px] text-neutral-500">run {created.onboardingRunId}<br />prod {created.productionHotelId}<br />sandbox {created.sandboxHotelId}</p><p className="mt-2 text-neutral-400">{bg ? "Следващият етап е Sandbox resource projection/certification. LIVE не е активиран." : "Next is Sandbox resource projection/certification. LIVE is not activated."}</p></div>}
        </aside>
      </div>
    </section>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs text-neutral-400">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 text-sm text-neutral-100" /></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <label className="text-xs text-neutral-400">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 text-sm text-neutral-100">{options.map((option) => <option key={`${label}:${option.value}`} value={option.value}>{option.label}</option>)}</select></label>; }
