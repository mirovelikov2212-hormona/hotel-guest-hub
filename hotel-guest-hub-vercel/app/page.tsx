import { headers } from "next/headers";
import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const hdrs = await headers();
  const host = (hdrs.get("host") || "").split(":")[0].toLowerCase();

  const sp = await searchParams;
  const room = first(sp.room);

  const isMainHost =
    host === "www.stayhub.app" ||
    host === "stayhub.app" ||
    host === "localhost";

  if (!isMainHost && host.endsWith(".stayhub.app")) {
    const subdomain = host.replace(".stayhub.app", "").trim();
    const suffix = room ? `?room=${encodeURIComponent(room)}` : "";
    redirect(`/h/${subdomain}${suffix}`);
  }

  redirect("/h/demo");
}