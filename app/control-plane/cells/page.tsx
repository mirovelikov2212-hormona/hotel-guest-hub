import Link from "next/link";
import { redirect } from "next/navigation";

import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import {
  getRuntimeCellFleetSnapshot,
  type RuntimeCellHealthState,
} from "@/lib/server/runtime-cell-control-plane";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    title: "Runtime клетки",
    subtitle: "Логическо разпределение и health на всички hotel tenants",
    back: "Назад към Control Plane",
    hotels: "Хотели",
    assigned: "Разпределени",
    unassigned: "Без клетка",
    cells: "Активни клетки",
    healthy: "Здрави",
    unverified: "Непотвърдени",
    attention: "Внимание",
    critical: "Критични",
    target: "Runtime target",
    capacity: "Капацитет",
    p95: "Цел p95",
    generation: "generation",
    source: "източник",
    projection: "projection",
    materialized: "runtime",
    noHotels: "Няма разпределени хотели.",
    generated: "Обновено",
    invariant: "Публичните hotel slugs и URL адреси не се променят при преместване между клетки.",
    healthInvariant: "Cell Health е read-only агрегация от съществуващите Factory/runtime/system evidence. Не се поддържа второ health състояние.",
  },
  en: {
    title: "Runtime cells",
    subtitle: "Logical partitioning and health of every hotel tenant",
    back: "Back to Control Plane",
    hotels: "Hotels",
    assigned: "Assigned",
    unassigned: "Unassigned",
    cells: "Active cells",
    healthy: "Healthy",
    unverified: "Unverified",
    attention: "Attention",
    critical: "Critical",
    target: "Runtime target",
    capacity: "Capacity",
    p95: "p95 target",
    generation: "generation",
    source: "source",
    projection: "projection",
    materialized: "runtime",
    noHotels: "No hotels assigned.",
    generated: "Generated",
    invariant: "Public hotel slugs and URLs stay unchanged when a tenant moves between cells.",
    healthInvariant: "Cell Health is a read-only aggregation of existing Factory/runtime/system evidence. No second health state is persisted.",
  },
} as const;

function scopeTone(scope: "production" | "sandbox" | "demo") {
  if (scope === "production") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (scope === "sandbox") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100";
}

function lifecycleTone(state: "active" | "draining" | "inactive") {
  if (state === "active") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (state === "draining") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-neutral-700 bg-neutral-950 text-neutral-400";
}

function healthTone(state: RuntimeCellHealthState) {
  if (state === "healthy") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (state === "critical") return "border-rose-300/30 bg-rose-300/10 text-rose-100";
  if (state === "attention") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  if (state === "unverified") return "border-violet-300/25 bg-violet-300/10 text-violet-100";
  return "border-neutral-700 bg-neutral-950 text-neutral-400";
}

export default async function RuntimeCellsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang = normalizeControlPlaneLang(rawLang);
  const copy = COPY[lang];
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) redirect(`/control-plane/login?lang=${lang}`);

  const fleet = await getRuntimeCellFleetSnapshot();

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/70">StayHub Control Plane</p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{copy.title}</h1>
              <p className="mt-2 text-sm text-neutral-400">{copy.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-xl border border-neutral-700 bg-neutral-950 p-1 text-xs font-semibold">
                <Link href="/control-plane/cells?lang=bg" className={`rounded-lg px-3 py-1.5 ${lang === "bg" ? "bg-neutral-100 text-neutral-950" : "text-neutral-400"}`}>BG</Link>
                <Link href="/control-plane/cells?lang=en" className={`rounded-lg px-3 py-1.5 ${lang === "en" ? "bg-neutral-100 text-neutral-950" : "text-neutral-400"}`}>EN</Link>
              </div>
              <Link href={`/control-plane?lang=${lang}`} className="rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-500">
                {copy.back}
              </Link>
            </div>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <p className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 px-4 py-3 text-sm text-cyan-100">{copy.invariant}</p>
            <p className="rounded-2xl border border-violet-300/20 bg-violet-300/5 px-4 py-3 text-sm text-violet-100">{copy.healthInvariant}</p>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {[
            [copy.hotels, fleet.hotelCount],
            [copy.assigned, fleet.assignedHotelCount],
            [copy.unassigned, fleet.unassignedHotelCount],
            [copy.cells, fleet.activeCellCount],
            [copy.healthy, fleet.healthyHotelCount],
            [copy.unverified, fleet.unverifiedHotelCount],
            [copy.attention, fleet.attentionHotelCount],
            [copy.critical, fleet.criticalHotelCount],
          ].map(([label, value]) => (
            <article key={String(label)} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <p className="text-sm text-neutral-400">{label}</p>
              <p className="mt-2 text-3xl font-semibold">{value}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          {fleet.cells.map((cell) => (
            <article key={cell.id} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{cell.cellKey}</p>
                  <h2 className="mt-1 text-xl font-semibold">{cell.displayName}</h2>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide">
                  <span className={`rounded-full border px-2.5 py-1 ${scopeTone(cell.environmentScope)}`}>{cell.environmentScope}</span>
                  <span className={`rounded-full border px-2.5 py-1 ${lifecycleTone(cell.lifecycleState)}`}>{cell.lifecycleState}</span>
                  <span className={`rounded-full border px-2.5 py-1 ${healthTone(cell.healthState)}`}>{cell.healthState}</span>
                  <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-neutral-300">{cell.cellClass}</span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-2xl bg-neutral-950 p-3"><p className="text-neutral-500">{copy.hotels}</p><p className="mt-1 font-semibold">{cell.hotelCount}</p></div>
                <div className="rounded-2xl bg-neutral-950 p-3"><p className="text-neutral-500">{copy.capacity}</p><p className="mt-1 font-semibold">{cell.hotelCount}/{cell.maxHotels}</p></div>
                <div className="rounded-2xl bg-neutral-950 p-3"><p className="text-neutral-500">{copy.p95}</p><p className="mt-1 font-semibold">≤ {cell.desiredMaxP95Ms} ms</p></div>
                <div className="rounded-2xl bg-neutral-950 p-3"><p className="text-neutral-500">{copy.target}</p><p className="mt-1 truncate font-semibold">{cell.routingTargetKey}</p></div>
              </div>

              <div className="mt-3 grid grid-cols-5 gap-2 text-xs">
                <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-2 text-emerald-100">{copy.healthy}: {cell.healthyCount}</div>
                <div className="rounded-xl border border-violet-300/15 bg-violet-300/5 p-2 text-violet-100">{copy.unverified}: {cell.unverifiedCount}</div>
                <div className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-2 text-amber-100">{copy.attention}: {cell.attentionCount}</div>
                <div className="rounded-xl border border-rose-300/15 bg-rose-300/5 p-2 text-rose-100">{copy.critical}: {cell.criticalCount}</div>
                <div className="rounded-xl border border-neutral-700 bg-neutral-950 p-2 text-neutral-400">inactive: {cell.inactiveHotelCount}</div>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-800" aria-label={`${cell.utilizationPercent}%`}>
                <div className="h-full rounded-full bg-neutral-200" style={{ width: `${Math.min(100, cell.utilizationPercent)}%` }} />
              </div>
              <p className="mt-2 text-xs text-neutral-500">{cell.utilizationPercent}% · {cell.capacityRemaining} free</p>

              <details className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-neutral-200">{copy.hotels} ({cell.hotelCount})</summary>
                <div className="border-t border-neutral-800 px-4 py-2">
                  {cell.hotels.length ? cell.hotels.map((hotel) => (
                    <div key={hotel.hotelId} className="flex flex-col gap-2 border-b border-neutral-900 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-neutral-100">{hotel.name}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${healthTone(hotel.healthState)}`}>{hotel.healthState}</span>
                        </div>
                        <p className="mt-1 text-xs text-neutral-500">{hotel.slug}{hotel.publicSlug && hotel.publicSlug !== hotel.slug ? ` · ${hotel.publicSlug}` : ""}</p>
                        <p className="mt-1 text-[11px] text-neutral-600">
                          {copy.projection}: {hotel.projectionStatus || "—"} · {copy.materialized}: {hotel.materializedRuntimeReady ? "ready" : "missing"} · 1h events C/E/W: {hotel.recentCriticalCount}/{hotel.recentErrorCount}/{hotel.recentWarningCount}
                        </p>
                      </div>
                      <p className="text-xs text-neutral-500">{copy.generation} {hotel.generation} · {copy.source}: {hotel.assignmentSource}</p>
                    </div>
                  )) : <p className="py-3 text-sm text-neutral-500">{copy.noHotels}</p>}
                </div>
              </details>
            </article>
          ))}
        </section>

        <p className="text-xs text-neutral-600">{copy.generated}: {fleet.generatedAt}</p>
      </div>
    </main>
  );
}
