export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { notFound } from "next/navigation";
import GuestHub from "@/components/GuestHub";
import { getHotelConfig } from "@/lib/config";

type PageProps = {
  params: Promise<{ hotelSlug: string }>;
};

export default async function HotelHubPage({ params }: PageProps) {
  const { hotelSlug } = await params;

  if (!hotelSlug) return notFound();

  const cfg = await getHotelConfig(hotelSlug);
  if (!cfg) return notFound();

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <GuestHub config={cfg} />
    </main>
  );
}
