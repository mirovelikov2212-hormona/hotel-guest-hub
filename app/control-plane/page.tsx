import Link from "next/link";
import { redirect } from "next/navigation";

import CommercialLifecyclePanel from "@/app/control-plane/CommercialLifecyclePanel";
import {
  controlPlaneHref,
  normalizeControlPlaneLang,
  type ControlPlaneLang,
} from "@/lib/control-plane-i18n";
import {
  getCommercialObservabilitySnapshot,
  type CommercialAttentionLevel,
} from "@/lib/server/commercial-observability";
import {
  getControlPlaneRegistrySnapshot,
  type ControlPlaneCommercialState,
} from "@/lib/server/control-plane-registry";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    overview: "Преглед на платформата",
    subtitle: "P3 търговско управление",
    registryMode: "Регистър само за преглед · Изрични търговски действия",
    logout: "Изход",
    organizations: "Организации",
    properties: "Хотели / обекти",
    environments: "Среди",
    managed: "Търговски управлявани",
    activeTrials: "Активни тестови периоди",
    customers: "Клиенти",
    attentionTitle: "Търговско внимание",
    attentionSubtitle: "Срокове и състояния, които изискват решение. Изчисляват се при зареждане — без cron.",
    attentionTotal: "Изискват внимание",
    expired: "Изтекли",
    oneDay: "До 1 ден",
    threeDays: "До 3 дни",
    sevenDays: "До 7 дни",
    pending: "Изчакват решение",
    suspended: "Спрени",
    noAttention: "Няма хотели, които изискват търговско внимание.",
    daysLeft: "дни остават",
    expiresAt: "Край",
    organization: "Организация",
    propertyPlural: "обекта",
    technical: "ТЕХНИЧЕСКИ",
    commercial: "Търговски статус",
    accessAllowed: "ДОСТЪП РАЗРЕШЕН",
    accessBlocked: "ДОСТЪП БЛОКИРАН",
    noPolicy: "БЕЗ P3 ПОЛИТИКА",
    plan: "План",
    version: "Версия",
    trialStart: "Начало на теста",
    trialEnd: "Край на теста",
    contractStart: "Начало на договора",
    active: "АКТИВНА",
    inactive: "НЕАКТИВНА",
    slug: "slug",
    publicSlug: "public",
    timelineTitle: "Последна търговска история",
    timelineSubtitle: "Последните immutable lifecycle събития от Control Plane.",
    noTimeline: "Все още няма търговски lifecycle събития.",
    reason: "Причина",
    changed: "Промяна",
    generated: "Регистърът е обновен",
  },
  en: {
    overview: "Platform overview",
    subtitle: "P3 commercial operations",
    registryMode: "Read only registry · Explicit commercial actions",
    logout: "Sign out",
    organizations: "Organizations",
    properties: "Hotels / properties",
    environments: "Environments",
    managed: "Commercial managed",
    activeTrials: "Active trials",
    customers: "Customers",
    attentionTitle: "Commercial attention",
    attentionSubtitle: "Deadlines and states requiring a decision. Calculated at page load — no cron.",
    attentionTotal: "Require attention",
    expired: "Expired",
    oneDay: "Within 1 day",
    threeDays: "Within 3 days",
    sevenDays: "Within 7 days",
    pending: "Awaiting decision",
    suspended: "Suspended",
    noAttention: "No hotels currently require commercial attention.",
    daysLeft: "days left",
    expiresAt: "Ends",
    organization: "Organization",
    propertyPlural: "properties",
    technical: "TECH",
    commercial: "Commercial",
    accessAllowed: "ACCESS ENTITLED",
    accessBlocked: "ACCESS NOT ENTITLED",
    noPolicy: "NO P3 POLICY YET",
    plan: "Plan",
    version: "Version",
    trialStart: "Trial start",
    trialEnd: "Trial end",
    contractStart: "Contract start",
    active: "ACTIVE",
    inactive: "INACTIVE",
    slug: "slug",
    publicSlug: "public",
    timelineTitle: "Recent commercial history",
    timelineSubtitle: "Latest immutable lifecycle events from the Control Plane.",
    noTimeline: "No commercial lifecycle events yet.",
    reason: "Reason",
    changed: "Change",
    generated: "Registry generated",
  },
} as const;

function badgeClass(environment: "production" | "sandbox" | "demo") {
  if (environment === "production") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (environment === "sandbox") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100";
}

function environmentLabel(environment: "production" | "sandbox" | "demo", lang: ControlPlaneLang) {
  if (lang === "en") return environment.toUpperCase();
  if (environment === "production") return "ПРОДУКЦИЯ";
  if (environment === "sandbox") return "ТЕСТОВА";
  return "ДЕМО";
}

function commercialBadgeClass(state: ControlPlaneCommercialState) {
  if (state.effectiveStatus === "trial_active") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (state.effectiveStatus === "customer_active") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (state.effectiveStatus === "trial_expired") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (state.effectiveStatus === "suspended") return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  if (state.effectiveStatus === "ended") return "border-neutral-600 bg-neutral-800 text-neutral-300";
  if (state.effectiveStatus === "pending") return "border-violet-300/25 bg-violet-300/10 text-violet-100";
  return "border-neutral-700 bg-neutral-950 text-neutral-400";
}

function commercialLabel(state: ControlPlaneCommercialState, lang: ControlPlaneLang) {
  const labels = lang === "bg"
    ? {
        trial_active: "ПРОБЕН ПЕРИОД",
        trial_expired: "ИЗТЕКЪЛ ПРОБЕН ПЕРИОД",
        customer_active: "КЛИЕНТ",
        suspended: "СПРЯН",
        ended: "ПРЕКРАТЕН",
        pending: "ИЗЧАКВА",
        unmanaged: "БЕЗ ТЪРГОВСКА ПОЛИТИКА",
      }
    : {
        trial_active: "TRIAL ACTIVE",
        trial_expired: "TRIAL EXPIRED",
        customer_active: "CUSTOMER",
        suspended: "SUSPENDED",
        ended: "ENDED",
        pending: "PENDING",
        unmanaged: "UNMANAGED / LEGACY",
      };
  return labels[state.effectiveStatus];
}

function technicalLifecycleLabel(
  value: "draft" | "pilot" | "active" | "suspended" | "archived",
  lang: ControlPlaneLang,
) {
  if (lang === "en") return value.toUpperCase();
  return {
    draft: "ЧЕРНОВА",
    pilot: "ПИЛОТ",
    active: "АКТИВЕН",
    suspended: "СПРЯН",
    archived: "АРХИВИРАН",
  }[value];
}

function formatUtc(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

function attentionTone(level: CommercialAttentionLevel) {
  if (level === "expired") return "border-rose-400/30 bg-rose-400/10 text-rose-100";
  if (level === "one_day") return "border-orange-400/30 bg-orange-400/10 text-orange-100";
  if (level === "three_days") return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  if (level === "seven_days") return "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
  if (level === "pending") return "border-violet-400/25 bg-violet-400/10 text-violet-100";
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function attentionLabel(level: CommercialAttentionLevel, lang: ControlPlaneLang) {
  const bg = {
    expired: "ИЗТЕКЪЛ",
    one_day: "ДО 1 ДЕН",
    three_days: "ДО 3 ДНИ",
    seven_days: "ДО 7 ДНИ",
    pending: "ИЗЧАКВА РЕШЕНИЕ",
    suspended: "СПРЯН",
  };
  const en = {
    expired: "EXPIRED",
    one_day: "WITHIN 1 DAY",
    three_days: "WITHIN 3 DAYS",
    seven_days: "WITHIN 7 DAYS",
    pending: "AWAITING DECISION",
    suspended: "SUSPENDED",
  };
  return (lang === "bg" ? bg : en)[level];
}

function actionLabel(action: string, lang: ControlPlaneLang) {
  const bg: Record<string, string> = {
    initialize: "Активирано търговско управление",
    start_trial: "Стартиран пробен период",
    extend_trial: "Удължен пробен период",
    convert_to_customer: "Преобразуван в клиент",
    suspend: "Спрян достъп",
    resume: "Възстановен достъп",
    end: "Прекратена услуга",
  };
  const en: Record<string, string> = {
    initialize: "Commercial control initialized",
    start_trial: "Trial started",
    extend_trial: "Trial extended",
    convert_to_customer: "Converted to customer",
    suspend: "Access suspended",
    resume: "Access resumed",
    end: "Commercial service ended",
  };
  return (lang === "bg" ? bg : en)[action] || action;
}

function statusLabel(value: string | null, lang: ControlPlaneLang) {
  if (!value) return "—";
  const bg: Record<string, string> = {
    pending: "изчаква",
    trial: "пробен период",
    active_customer: "клиент",
    suspended: "спрян",
    ended: "прекратен",
  };
  const en: Record<string, string> = {
    pending: "pending",
    trial: "trial",
    active_customer: "customer",
    suspended: "suspended",
    ended: "ended",
  };
  return (lang === "bg" ? bg : en)[value] || value;
}

export default async function ControlPlanePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang = normalizeControlPlaneLang(rawLang);
  const copy = COPY[lang];

  const authority = await getCurrentPlatformAdminSession();
  // P1.2 base-route invariant: redirect("/control-plane/login") remains the authority boundary;
  // controlPlaneHref only preserves the validated BG/EN presentation preference.
  if (!authority) redirect(controlPlaneHref("/control-plane/login", lang));

  const snapshot = await getControlPlaneRegistrySnapshot();
  const observability = await getCommercialObservabilitySnapshot(snapshot.properties);

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-neutral-800 bg-neutral-900 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/70">
              StayHub Control Plane
            </p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{copy.overview}</h1>
            <p className="mt-2 text-sm text-neutral-400">
              {copy.subtitle} · {authority.email || "Platform Admin"} · {authority.role}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-xl border border-neutral-700 bg-neutral-950 p-1 text-xs font-semibold">
              <Link
                href="/control-plane?lang=bg"
                className={`rounded-lg px-3 py-1.5 ${lang === "bg" ? "bg-neutral-100 text-neutral-950" : "text-neutral-400 hover:text-neutral-100"}`}
              >
                BG
              </Link>
              <Link
                href="/control-plane?lang=en"
                className={`rounded-lg px-3 py-1.5 ${lang === "en" ? "bg-neutral-100 text-neutral-950" : "text-neutral-400 hover:text-neutral-100"}`}
              >
                EN
              </Link>
            </div>
            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-100">
              {copy.registryMode}
            </span>
            <form action={`/api/control-plane/logout?lang=${lang}`} method="post">
              <button
                type="submit"
                className="rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500"
              >
                {copy.logout}
              </button>
            </form>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {[
            [copy.organizations, snapshot.organizations.length],
            [copy.properties, snapshot.propertyCount],
            [copy.environments, snapshot.environmentCount],
            [copy.managed, snapshot.commercialManagedCount],
            [copy.activeTrials, snapshot.activeTrialCount],
            [copy.customers, snapshot.activeCustomerCount],
          ].map(([label, value]) => (
            <article key={String(label)} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <p className="text-sm text-neutral-400">{label}</p>
              <p className="mt-2 text-3xl font-semibold">{value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/70">
                P3.4
              </p>
              <h2 className="mt-1 text-xl font-semibold">{copy.attentionTitle}</h2>
              <p className="mt-1 text-sm text-neutral-500">{copy.attentionSubtitle}</p>
            </div>
            <span className="text-sm font-semibold text-neutral-300">
              {copy.attentionTotal}: {observability.attentionCount}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {[
              [copy.expired, observability.expiredCount],
              [copy.oneDay, observability.dueWithinOneDayCount],
              [copy.threeDays, observability.dueWithinThreeDaysCount],
              [copy.sevenDays, observability.dueWithinSevenDaysCount],
              [copy.pending, observability.pendingCount],
              [copy.suspended, observability.suspendedCount],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
                <p className="text-xs text-neutral-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-neutral-100">{value}</p>
              </div>
            ))}
          </div>

          {observability.attention.length ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {observability.attention.map((item) => (
                <a
                  key={item.propertyId}
                  href={`#property-${item.propertyId}`}
                  className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 transition hover:border-neutral-600"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-neutral-100">{item.displayName}</p>
                      {item.daysRemaining !== null && item.level !== "expired" ? (
                        <p className="mt-1 text-xs text-neutral-400">
                          <strong className="text-neutral-100">{item.daysRemaining}</strong> {copy.daysLeft}
                        </p>
                      ) : null}
                      {item.trialEndsAt ? (
                        <p className="mt-1 text-xs text-neutral-600">
                          {copy.expiresAt}: {formatUtc(item.trialEndsAt)}
                        </p>
                      ) : null}
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${attentionTone(item.level)}`}>
                      {attentionLabel(item.level, lang)}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-100">
              {copy.noAttention}
            </div>
          )}
        </section>

        {snapshot.organizations.map((organization) => {
          const properties = snapshot.properties.filter(
            (property) => property.organizationId === organization.id,
          );

          return (
            <section key={organization.id} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">{copy.organization}</p>
                  <h2 className="mt-1 text-xl font-semibold">{organization.displayName}</h2>
                  <p className="mt-1 text-sm text-neutral-500">{organization.slug}</p>
                </div>
                <span className="text-sm text-neutral-400">{properties.length} {copy.propertyPlural}</span>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {properties.map((property) => (
                  <article
                    id={`property-${property.id}`}
                    key={property.id}
                    className="scroll-mt-6 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-neutral-100">{property.displayName}</h3>
                        <p className="mt-1 text-sm text-neutral-500">{property.propertyKey}</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-300">
                          {copy.technical} {technicalLifecycleLabel(property.lifecycleState, lang)}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${commercialBadgeClass(property.commercial)}`}>
                          {commercialLabel(property.commercial, lang)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                          {copy.commercial}
                        </p>
                        {property.commercial.managed ? (
                          <span className={`text-xs font-semibold ${property.commercial.accessAllowed ? "text-emerald-300" : "text-amber-300"}`}>
                            {property.commercial.accessAllowed ? copy.accessAllowed : copy.accessBlocked}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-neutral-500">{copy.noPolicy}</span>
                        )}
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-neutral-400 sm:grid-cols-2">
                        <p>{copy.plan}: <span className="text-neutral-200">{property.commercial.planCode || "—"}</span></p>
                        <p>{copy.version}: <span className="text-neutral-200">{property.commercial.version ?? "—"}</span></p>
                        <p>{copy.trialStart}: <span className="text-neutral-200">{formatUtc(property.commercial.trialStartedAt) || "—"}</span></p>
                        <p>{copy.trialEnd}: <span className="text-neutral-200">{formatUtc(property.commercial.trialEndsAt) || "—"}</span></p>
                        <p className="sm:col-span-2">{copy.contractStart}: <span className="text-neutral-200">{formatUtc(property.commercial.contractStartedAt) || "—"}</span></p>
                      </div>
                    </div>

                    <CommercialLifecyclePanel
                      lang={lang}
                      propertyId={property.id}
                      displayName={property.displayName}
                      productionLive={property.environments.some(
                        (environment) => environment.environment === "production" && environment.active,
                      )}
                      commercial={{
                        managed: property.commercial.managed,
                        status: property.commercial.status,
                        effectiveStatus: property.commercial.effectiveStatus,
                        version: property.commercial.version,
                        planCode: property.commercial.planCode,
                        trialEndsAt: property.commercial.trialEndsAt,
                      }}
                    />

                    <div className="mt-4 space-y-3">
                      {property.environments.map((environment) => (
                        <div key={environment.id} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${badgeClass(environment.environment)}`}>
                              {environmentLabel(environment.environment, lang)}
                            </span>
                            <span className={`text-xs font-semibold ${environment.active ? "text-emerald-300" : "text-rose-300"}`}>
                              {environment.active ? copy.active : copy.inactive}
                            </span>
                          </div>
                          <p className="mt-3 text-sm font-medium text-neutral-200">{environment.hotelName}</p>
                          <p className="mt-1 text-xs leading-5 text-neutral-500">
                            {copy.slug}: {environment.hotelSlug}
                            {environment.publicSlug ? ` · ${copy.publicSlug}: ${environment.publicSlug}` : ""}
                            {` · ${environment.timezone}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
          <h2 className="text-xl font-semibold">{copy.timelineTitle}</h2>
          <p className="mt-1 text-sm text-neutral-500">{copy.timelineSubtitle}</p>

          {observability.recentEvents.length ? (
            <div className="mt-5 space-y-3">
              {observability.recentEvents.slice(0, 12).map((event) => (
                <article key={event.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-neutral-100">{event.displayName}</p>
                      <p className="mt-1 text-sm text-cyan-200">{actionLabel(event.action, lang)}</p>
                    </div>
                    <span className="text-xs text-neutral-500">{formatUtc(event.createdAt)}</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-neutral-400 sm:grid-cols-2">
                    <p>{copy.changed}: <span className="text-neutral-200">{statusLabel(event.previousStatus, lang)} → {statusLabel(event.newStatus, lang)}</span></p>
                    <p>{copy.plan}: <span className="text-neutral-200">{event.planCode || "—"}</span></p>
                    <p className="sm:col-span-2">{copy.reason}: <span className="text-neutral-200">{event.reason}</span></p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-3 text-sm text-neutral-500">
              {copy.noTimeline}
            </div>
          )}
        </section>

        <p className="text-center text-xs text-neutral-600">
          {copy.generated} {new Date(snapshot.generatedAt).toISOString().replace("T", " ").slice(0, 19)} UTC
        </p>
      </div>
    </main>
  );
}
