import StaffDevelopmentRoutePage from "@/components/staff/pages/StaffDevelopmentRoutePage";

export default async function StaffDevelopmentHousekeepingPage({
  params,
}: {
  params: Promise<{ hotelSlug: string }>;
}) {
  const { hotelSlug } = await params;
  return (
    <StaffDevelopmentRoutePage
      hotelSlug={hotelSlug}
      operationalRole="housekeeping"
    />
  );
}
