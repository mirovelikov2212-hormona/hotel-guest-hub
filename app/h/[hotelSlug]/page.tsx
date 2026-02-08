export const runtime = "nodejs";

import { notFound } from "next/navigation";
import { getHotelConfig } from "@/lib/config";
import GuestHub from "@/components/GuestHub";

export default async function HotelHubPage({
  params,
}: {
  params: { hotelSlug: string };
}) {
  const cfg = await getHotelConfig(params.hotelSlug);

  if (!cfg) return notFound();

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <GuestHub config={cfg} />
    </main>
  );
}
