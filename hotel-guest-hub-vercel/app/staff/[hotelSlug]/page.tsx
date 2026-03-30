import StaffHomePageContent from "@/components/staff/pages/StaffHomePageContent";

type PageProps = {
  params: Promise<{ hotelSlug: string }>;
};

export default async function StaffHotelHomePage({ params }: PageProps) {
  const { hotelSlug } = await params;
  return <StaffHomePageContent hotelSlug={hotelSlug} />;
}
