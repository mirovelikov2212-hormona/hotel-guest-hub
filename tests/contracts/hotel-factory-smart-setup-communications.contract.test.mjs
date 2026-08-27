import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const wizardPath = "app/hotel-factory/new/HotelManagerOnboardingWizard.tsx";

test("Hotel Factory Smart Setup exposes Communications before Review", async () => {
  const wizard = await readProjectFile(wizardPath);

  assertContains(wizard, '["Хотел", "Стаи и езици", "Екипи", "Услуги", "Контакти", "Преглед"]');
  assertContains(wizard, '["Hotel", "Rooms & languages", "Teams", "Services", "Contacts", "Review"]');
  assertContains(wizard, "step === 4");
  assertContains(wizard, "copy.contactsTitle");
  assertContains(wizard, "step === 5");
  assertContains(wizard, "copy.reviewTitle");
  assertContains(wizard, "step < 5");
  assertContains(wizard, "Math.min(5, v + 1)");
});

test("Hotel Factory Smart Setup writes canonical department.contact channels", async () => {
  const wizard = await readProjectFile(wizardPath);

  assertContains(wizard, "DepartmentContactDraft");
  assertContains(wizard, "departmentContacts");
  assertContains(wizard, "contact: contactPayload");
  assertContains(wizard, "phone: contact.phone.trim()");
  assertContains(wizard, "whatsapp: contact.whatsapp.trim()");
  assertContains(wizard, "email: contact.email.trim()");
  assertContains(wizard, 'inputMode="tel"');
  assertContains(wizard, 'type="email"');
});

test("Hotel Factory Smart Setup validates contacts before authoritative preflight", async () => {
  const wizard = await readProjectFile(wizardPath);

  assertContains(wizard, "validEmail(contact.email)");
  assertContains(wizard, "contact.phone.trim().length > 160");
  assertContains(wizard, "contact.whatsapp.trim().length > 160");
  assertContains(wizard, "contact.email.trim().length > 320");
  assertContains(wizard, 'fetch("/api/control-plane/onboarding/preflight"');
});

test("Hotel Factory Smart Setup remains fail-closed for Production", async () => {
  const wizard = await readProjectFile(wizardPath);

  assertContains(wizard, "keepProductionInactive: true");
  assertContains(wizard, "keepSandboxInactive: true");
  assertContains(wizard, "publishRevision: false");
  assertContains(wizard, "activateLive: false");
  assertNotContains(wizard, "production-live-activation");
});
