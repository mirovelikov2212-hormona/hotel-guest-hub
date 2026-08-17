export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import GuestHub from "@/components/GuestHub";
import { getHotelConfig } from "@/lib/config";
import {
  DEMO_ACCESS_COOKIE_NAME,
  hasValidDemoAccessCookie,
  isDemoAccessConfigured,
} from "@/lib/demo-access";
import { isCommercialRuntimeAccessDeniedError } from "@/lib/server/commercial-runtime-entitlement";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type PageProps = {
  params: Promise<{ hotelSlug: string }>;
  searchParams: SearchParams;
};

function getSingleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function DemoAccessGate({
  accessStatus,
  isConfigured,
}: {
  accessStatus?: string;
  isConfigured: boolean;
}) {
  const isInvalid = accessStatus === "invalid";
  const isUnavailable = !isConfigured || accessStatus === "unavailable";

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-50">
      <section className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-400">
          StayHub Demo
        </p>
        <h1 className="mt-3 text-2xl font-bold">Защитен демо достъп</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-300">
          Демонстрационната версия е достъпна само с код за достъп.
        </p>

        {isUnavailable ? (
          <div className="mt-6 rounded-2xl border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            Демото временно не е достъпно. Свържете се със StayHub за достъп.
          </div>
        ) : (
          <form action="/api/demo-access" method="post" className="mt-6 space-y-4">
            <input type="hidden" name="next" value="/h/demo" />
            <label className="block text-sm font-medium text-neutral-200" htmlFor="demo-pin">
              Код за достъп
            </label>
            <input
              id="demo-pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              required
              autoFocus
              className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-50 outline-none transition focus:border-neutral-400"
            />
            {isInvalid ? (
              <p className="text-sm text-red-300">Невалиден код за достъп.</p>
            ) : null}
            <button
              type="submit"
              className="w-full rounded-2xl bg-neutral-50 px-4 py-3 font-semibold text-neutral-950 transition hover:bg-white"
            >
              Отвори демото
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function CommercialAccessUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-50">
      <section className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-center shadow-2xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
          StayHub
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Digital concierge unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-300">
          The hotel&apos;s digital concierge is temporarily unavailable.
        </p>
        <p className="mt-2 text-sm leading-6 text-neutral-400">
          Please contact Reception for assistance.
        </p>
      </section>
    </main>
  );
}

export default async function HotelHubPage({ params, searchParams }: PageProps) {
  const { hotelSlug } = await params;

  if (!hotelSlug) return notFound();

  if (hotelSlug.trim().toLowerCase() === "demo") {
    const cookieStore = await cookies();
    const hasDemoAccess = hasValidDemoAccessCookie(
      cookieStore.get(DEMO_ACCESS_COOKIE_NAME)?.value
    );

    if (!hasDemoAccess) {
      const resolvedSearchParams = await searchParams;
      return (
        <DemoAccessGate
          accessStatus={getSingleSearchParam(resolvedSearchParams.demoAccess)}
          isConfigured={isDemoAccessConfigured()}
        />
      );
    }
  }

  try {
    await resolveHotelByAnySlugAdmin(hotelSlug);
  } catch (error) {
    if (isCommercialRuntimeAccessDeniedError(error)) {
      return <CommercialAccessUnavailable />;
    }
    return notFound();
  }

  const cfg = await getHotelConfig(hotelSlug);
  if (!cfg) return notFound();

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <GuestHub config={cfg} />
    </main>
  );
}
