import { notFound } from "next/navigation";
import StaffPinGate from "@/components/staff/StaffPinGate";

type StaffRole = "reception" | "housekeeping" | "maintenance" | "manager";

function isValidRole(value: string): value is StaffRole {
  return (
    value === "reception" ||
    value === "housekeeping" ||
    value === "maintenance" ||
    value === "manager"
  );
}

export default async function StaffPinPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotelSlug: string }>;
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const { hotelSlug } = await params;
  const sp = await searchParams;

  const role = String(sp.role || "").trim().toLowerCase();
  if (!isValidRole(role)) {
    notFound();
  }

  const validRole: StaffRole = role;

  const nextPath =
    typeof sp.next === "string" && sp.next.startsWith(`/staff/${hotelSlug}/`)
      ? sp.next
      : `/staff/${hotelSlug}/${validRole}`;

  return <StaffPinGate hotelSlug={hotelSlug} role={validRole} nextPath={nextPath} />;
}