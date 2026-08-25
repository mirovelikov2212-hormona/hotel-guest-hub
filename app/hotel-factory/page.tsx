import { redirect } from "next/navigation";

import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";

export const dynamic = "force-dynamic";

export default async function HotelFactoryHome({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang = normalizeControlPlaneLang(rawLang);
  redirect(`/hotel-factory/new?lang=${lang}`);
}
