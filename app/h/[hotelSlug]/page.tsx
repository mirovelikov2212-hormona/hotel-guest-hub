import { notFound } from "next/navigation";
import { getHotelConfig } from "@/lib/config";
import GuestHub from "@/components/GuestHub";

export default async function HotelHubPage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;
  const cfg = await getHotelConfig(hotelSlug);

  if (!cfg) return notFound();

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <GuestHub config={cfg} />
    </main>
  );
}
