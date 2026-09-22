import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("CM5 Manager UI exposes structured and ready-made agency offer paths without LIVE activation", async () => {
  const source=await readProjectFile("components/staff/ManagerContentOffersEditor.tsx");
  for(const fragment of [
    '"Създай в Hub"',
    '"Качи готова оферта"',
    '"Версия за Hub"',
    '"Версия за сайта"',
    '"website_source"',
    '"hub_ready"',
    "uploadToSignedUrl",
    '"save_draft"',
    "object-contain",
    'label: "BG"',
    'label: "EN"',
    'label: "DE"',
    'label: "RO"',
    'label: "CZ"',
    'label: "RU"',
  ]) assertContains(source,fragment);

  assertNotContains(source,"confirm_draft");
  assertNotContains(source,"PlatformAdminAuthority");
});

test("Manager dashboard mounts the Hub offer editor as a hotel-scoped manager feature", async () => {
  const source=await readProjectFile("components/staff/pages/ManagerPageContent.tsx");
  assertContains(source,'import ManagerContentOffersEditor from "@/components/staff/ManagerContentOffersEditor"');
  assertContains(source,'<ManagerContentOffersEditor hotelSlug={hotelSlug} lang={lang} />');
});

test("Guest ready-made creative rendering preserves the full visual and opens PDFs", async () => {
  const source=await readProjectFile("components/guest/GuestOffersPanel.tsx");
  assertContains(source,"getHotelOfferReadyCreative");
  assertContains(source,'className="max-h-[72vh] w-full object-contain"');
  assertContains(source,'target="_blank"');
  assertContains(source,"openReadyOffer");
});
