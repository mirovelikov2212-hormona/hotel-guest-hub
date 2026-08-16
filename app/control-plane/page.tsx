import { redirect } from "next/navigation";
import { getControlPlaneRegistrySnapshot } from "@/lib/server/control-plane-registry";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

function badgeClass(environment: "production" | "sandbox" | "demo") {
  if (environment === "production") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (environment === "sandbox") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100";
}

export default async function ControlPlanePage() {
  const authority = await getCurrentPlatformAdminSession();
  if (!authority) redirect("/control-plane/login");

  const snapshot = await getControlPlaneRegistrySnapshot();

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-neutral-800 bg-neutral-900 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/70">
              StayHub Control Plane
            </p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Platform overview</h1>
            <p className="mt-2 text-sm text-neutral-400">
              Read-only P1.2 foundation · {authority.email || "Platform Admin"} · {authority.role}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-100">
              Read only
            </span>
            <form action="/api/control-plane/logout" method="post">
              <button
                type="submit"
                className="rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500"
              >
                Изход
              </button>
            </form>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-sm text-neutral-400">Organizations</p>
            <p className="mt-2 text-3xl font-semibold">{snapshot.organizations.length}</p>
          </article>
          <article className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-sm text-neutral-400">Properties</p>
            <p className="mt-2 text-3xl font-semibold">{snapshot.propertyCount}</p>
          </article>
          <article className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-sm text-neutral-400">Environments</p>
            <p className="mt-2 text-3xl font-semibold">{snapshot.environmentCount}</p>
          </article>
          <article className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-sm text-neutral-400">Registry generated</p>
            <p className="mt-2 text-sm font-semibold text-neutral-200">
              {new Date(snapshot.generatedAt).toISOString().replace("T", " ").slice(0, 19)} UTC
            </p>
          </article>
        </section>

        {snapshot.organizations.map((organization) => {
          const properties = snapshot.properties.filter(
            (property) => property.organizationId === organization.id,
          );

          return (
            <section key={organization.id} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Organization</p>
                  <h2 className="mt-1 text-xl font-semibold">{organization.displayName}</h2>
                  <p className="mt-1 text-sm text-neutral-500">{organization.slug}</p>
                </div>
                <span className="text-sm text-neutral-400">{properties.length} properties</span>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {properties.map((property) => (
                  <article key={property.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-neutral-100">{property.displayName}</h3>
                        <p className="mt-1 text-sm text-neutral-500">{property.propertyKey}</p>
                      </div>
                      <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-300">
                        {property.lifecycleState}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {property.environments.map((environment) => (
                        <div key={environment.id} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${badgeClass(environment.environment)}`}>
                              {environment.environment}
                            </span>
                            <span className={`text-xs font-semibold ${environment.active ? "text-emerald-300" : "text-rose-300"}`}>
                              {environment.active ? "ACTIVE" : "INACTIVE"}
                            </span>
                          </div>
                          <p className="mt-3 text-sm font-medium text-neutral-200">{environment.hotelName}</p>
                          <p className="mt-1 text-xs leading-5 text-neutral-500">
                            slug: {environment.hotelSlug}
                            {environment.publicSlug ? ` · public: ${environment.publicSlug}` : ""}
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
      </div>
    </main>
  );
}
