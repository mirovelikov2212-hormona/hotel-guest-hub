export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { notFound } from "next/navigation";
import { getHotelConfig } from "@/lib/config";
import GuestHub from "@/components/GuestHub";

export default async function HotelHubPage({ params }: { params: unknown }) {
  const p: any = await Promise.resolve(params);
  const hotelSlug = p?.hotelSlug as string | undefined;

  if (!hotelSlug) return notFound();

  const cfg = await getHotelConfig(hotelSlug);
  if (!cfg) return notFound();

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <GuestHub config={cfg} />
    </main>
  );
}
