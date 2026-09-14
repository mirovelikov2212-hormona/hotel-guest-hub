import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveGuestRootEntry } from "@/lib/server/guest-root-entry.mjs";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function appendSearchParam(params: URLSearchParams, key: string, value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (item !== undefined && item !== "") params.append(key, item);
    });
    return;
  }

  if (value !== undefined && value !== "") params.set(key, value);
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const hdrs = await headers();
  const host = (hdrs.get("host") || "").split(":")[0].toLowerCase();
  const sp = await searchParams;
  const params = new URLSearchParams();

  Object.entries(sp || {}).forEach(([key, value]) => appendSearchParam(params, key, value));

  const destination = resolveGuestRootEntry({
    host,
    vercelEnv: process.env.VERCEL_ENV,
    previewHotelSlug: process.env.STAYHUB_PREVIEW_HOTEL_SLUG,
  });
  const query = params.toString();

  redirect(`${destination}${query ? `?${query}` : ""}`);
}
