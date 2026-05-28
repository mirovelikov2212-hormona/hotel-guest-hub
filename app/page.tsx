import { headers } from "next/headers";
import { redirect } from "next/navigation";

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

  const isMainHost =
    host === "www.stayhub.app" ||
    host === "stayhub.app" ||
    host === "localhost";

  if (!isMainHost && host.endsWith(".stayhub.app")) {
    const subdomain = host.replace(".stayhub.app", "").trim();
    const params = new URLSearchParams();

    Object.entries(sp || {}).forEach(([key, value]) => appendSearchParam(params, key, value));

    const query = params.toString();
    redirect(`/h/${subdomain}${query ? `?${query}` : ""}`);
  }

  redirect("/h/demo");
}
