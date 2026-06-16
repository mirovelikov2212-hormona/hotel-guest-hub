import MassageAvailabilityPreview from "@/components/MassageAvailabilityPreview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : String(value || "");
}

export default async function MassagePreviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const hotelSlug = firstParam(params.hotelSlug).trim().toLowerCase() || "aquamarin";
  const initialLanguage = firstParam(params.lang).trim().toLowerCase() || "bg";

  return (
    <MassageAvailabilityPreview
      hotelSlug={hotelSlug}
      initialLanguage={initialLanguage}
    />
  );
}
