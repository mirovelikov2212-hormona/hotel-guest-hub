import { notFound } from "next/navigation";
import StandaloneStaffDemo from "@/components/marketing/StandaloneStaffDemo";

const ROLES = ["manager", "reception", "housekeeping", "maintenance"] as const;
export const dynamic = "force-dynamic";

export default async function StaffPanelDemoPage({ params, searchParams }: {
  params: Promise<{ role: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ role }, query] = await Promise.all([params, searchParams]);
  const selectedRole = ROLES.find((value) => value === role);
  if (!selectedRole) notFound();
  const lang = query.lang === "en" || query.lang === "de" ? query.lang : "bg";
  return <StandaloneStaffDemo role={selectedRole} lang={lang} />;
}
