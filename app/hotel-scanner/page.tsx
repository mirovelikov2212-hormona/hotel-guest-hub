import { redirect } from "next/navigation";

import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";

export default async function HotelScannerPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang = normalizeControlPlaneLang(rawLang);

  redirect(`/hotel-scanner-v2-workflow?lang=${lang}`);
}
