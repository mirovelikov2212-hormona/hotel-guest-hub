import TestHubPreviewClient from "./TestHubPreviewClient";

export const dynamic = "force-dynamic";

export default async function TestHubPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await searchParams;
  const lang = rawLang === "en" ? "en" : "bg";
  return <TestHubPreviewClient lang={lang} />;
}
