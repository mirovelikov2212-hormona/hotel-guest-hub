export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import GuestCommunicationsInbox from "@/components/GuestCommunicationsInbox";
import GuestHub from "@/components/GuestHub";
import { getHotelConfig } from "@/lib/config";
import {
  DEMO_ACCESS_COOKIE_NAME,
  PUBLIC_MARKETING_DEMO_PIN,
  hasValidDemoAccessCookie,
  isDemoAccessConfigured,
} from "@/lib/demo-access";
import { isCommercialRuntimeAccessDeniedError } from "@/lib/server/commercial-runtime-entitlement";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import type { LangKey } from "@/lib/types";

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
          GOSTAYA LIVE DEMO
        </p>
        <h1 className="mt-3 text-2xl font-bold">Истинският Guest Hub</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-300">
          Това е реалният GOSTAYA demo tenant. Въведете публичния demo PIN, за да го тествате.
        </p>
        <div className="mt-5 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
            Demo PIN
          </div>
          <div className="mt-1 text-3xl font-bold tracking-[0.2em] text-white">
            {PUBLIC_MARKETING_DEMO_PIN}
          </div>
        </div>

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
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
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
              className="w-full rounded-2xl bg-cyan-300 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Отвори истинския Guest Hub
            </button>
            <p className="text-center text-xs leading-5 text-neutral-500">
              Demo среда — не изпраща заявки към реален хотел.
            </p>
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

  // The validated /h/[hotelSlug] route is the guest tenant authority. Hotel
  // configuration supplies content and capabilities, but must never override
  // tenant identity for guest operational API calls.
  const guestRuntimeHotelSlug = hotelSlug.trim().toLowerCase();
  const guestConfig = {
    ...cfg,
    hotelSlug: guestRuntimeHotelSlug,
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <GuestHub config={guestConfig} />
      <GuestCommunicationsInbox
        hotelSlug={guestRuntimeHotelSlug}
        defaultLanguage={(cfg.languageDefault || "en") as LangKey}
        brandColor={String(cfg.theme?.primary || cfg.theme?.accent || "#43B5A1")}
      />
    </main>
  );
}