import Link from "next/link";
import { redirect } from "next/navigation";

import ControlPanelThemeShell from "@/components/control-panel/ControlPanelThemeShell";
import MassageCatalogEditor from "@/components/control-panel/MassageCatalogEditor";
import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";
import { normalizeAdminNextTarget } from "@/lib/control-plane-next";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";
import { listMassageCatalogHotels, listMassageCatalogServices } from "@/lib/server/massage-catalog-admin";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    title: "Централен каталог за масажи",
    subtitle: "StayHub управлява услугите, цените, валутата, продължителността, активността, преводите и подредбата. Външни адаптери могат да влияят само на график и наличности.",
    hotel: "Хотел",
    open: "Отвори",
    back: "Към Control Panel",
    authority: "Catalog authority: StayHub",
    empty: "Няма налични хотели.",
    production: "Production",
    sandbox: "Sandbox",
    active: "active",
    inactive: "inactive",
  },
  en: {
    title: "Central Massage Catalog",
    subtitle: "StayHub owns services, prices, currency, duration, active state, translations and ordering. External adapters may affect schedule and availability only.",
    hotel: "Hotel",
    open: "Open",
    back: "Back to Control Panel",
    authority: "Catalog authority: StayHub",
    empty: "No hotels are available.",
    production: "Production",
    sandbox: "Sandbox",
    active: "active",
    inactive: "inactive",
  },
} as const;

export default async function MassageCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; hotel?: string }>;
}) {
  const params = await searchParams;
  const lang = normalizeControlPlaneLang(params.lang);
  const copy = COPY[lang];
  const authority = await getCurrentPlatformAdminSession();

  if (!authority) {
    const next = normalizeAdminNextTarget(`/control-panel/massages?lang=${lang}`, lang);
    redirect(`/control-plane/login?lang=${lang}&next=${encodeURIComponent(next)}`);
  }

  const hotels = await listMassageCatalogHotels();
  const requested = String(params.hotel || "").trim();
  const selected =
    hotels.find((hotel) => hotel.id === requested || hotel.slug === requested || hotel.publicSlug === requested)
    || hotels.find((hotel) => hotel.active && !hotel.isSandbox)
    || hotels[0]
    || null;
  const services = selected ? await listMassageCatalogServices(selected.id) : [];

  return (
    <ControlPanelThemeShell>
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="rounded-[2rem] border border-[var(--cp-border)] bg-[var(--cp-surface)] p-6 shadow-[var(--cp-shadow)] sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-4xl">
                <div className="inline-flex rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cp-accent)]">
                  {copy.authority}
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--cp-text)] sm:text-4xl">{copy.title}</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--cp-muted)] sm:text-base">{copy.subtitle}</p>
              </div>
              <Link href={`/control-panel?lang=${lang}`} className="inline-flex min-h-11 items-center rounded-xl border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-4 text-sm font-semibold text-[var(--cp-text)]">
                ← {copy.back}
              </Link>
            </div>
          </header>

          {selected ? (
            <>
              <section className="rounded-2xl border border-[var(--cp-border)] bg-[var(--cp-card)] p-5 shadow-[var(--cp-shadow)]">
                <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <input type="hidden" name="lang" value={lang} />
                  <label className="min-w-0 flex-1 text-xs font-semibold text-[var(--cp-muted)]">
                    {copy.hotel}
                    <select
                      name="hotel"
                      defaultValue={selected.id}
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-3 text-sm text-[var(--cp-text)] outline-none focus:border-teal-500"
                    >
                      {hotels.map((hotel) => (
                        <option key={hotel.id} value={hotel.id}>
                          {hotel.name} · {hotel.isSandbox ? copy.sandbox : copy.production} · {hotel.active ? copy.active : copy.inactive}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="min-h-11 rounded-xl bg-[var(--cp-text)] px-5 text-sm font-semibold text-[var(--cp-surface)]">
                    {copy.open}
                  </button>
                </form>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--cp-muted)]">
                  <span className="rounded-full border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-3 py-1.5">{selected.slug}</span>
                  <span className="rounded-full border border-[var(--cp-border)] bg-[var(--cp-card-soft)] px-3 py-1.5">{services.length} services</span>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-700">StayHub-owned</span>
                </div>
              </section>

              <MassageCatalogEditor hotelId={selected.id} services={services} />
            </>
          ) : (
            <section className="rounded-2xl border border-[var(--cp-border)] bg-[var(--cp-card)] p-6 text-sm text-[var(--cp-muted)] shadow-[var(--cp-shadow)]">
              {copy.empty}
            </section>
          )}
        </div>
      </main>
    </ControlPanelThemeShell>
  );
}
