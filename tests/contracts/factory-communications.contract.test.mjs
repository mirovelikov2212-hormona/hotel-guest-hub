import assert from "node:assert/strict";
import test from "node:test";

import { prepareFactoryCommunications } from "../../lib/product-factory/factory-communications-model.mjs";
import { prepareFactoryGuestRuntimeConfig } from "../../lib/product-factory/factory-guest-runtime-config-model.mjs";
import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

function blueprint() {
  return {
    version: 1,
    organization: { id: "proof-communications", name: "Proof Communications" },
    property: {
      slug: "proof-communications",
      publicSlug: "proof-communications",
      name: "Proof Communications Hotel",
      countryCode: "DE",
      timezone: "Europe/Berlin",
      locales: ["en", "de", "bg"],
      roomCount: 1,
      roomInventory: { explicit: [{ number: "101" }] },
    },
    environment: { production: true, sandbox: true },
    departments: [
      {
        id: "reception",
        name: "Reception",
        hours: { is24h: true },
        contact: {
          phone: "+49 30 123456",
          whatsapp: "+49 151 12345678",
          email: "reception@example.com",
        },
      },
      {
        id: "housekeeping",
        name: "Housekeeping",
        hours: { open: "07:00", close: "17:00" },
        afterHoursDepartmentId: "reception",
      },
    ],
    services: [],
    workflows: [],
    integrations: [],
    nativeContent: { wifi: { ssid: "", guestAccessCode: "" }, items: [] },
    venues: [],
  };
}

test("STEP 2D communications uses canonical department contact channels", () => {
  const prepared = prepareFactoryCommunications({ blueprint: blueprint() });

  assert.equal(prepared.communications.schema_version, "step2d-communications-v1");
  assert.equal(prepared.communications.department_contacts.length, 2);
  assert.deepEqual(prepared.communications.department_contacts[0], {
    department_code: "reception",
    phone: "+49 30 123456",
    whatsapp: "+49 151 12345678",
    email: "reception@example.com",
  });
  assert.deepEqual(prepared.communications.department_contacts[1], {
    department_code: "housekeeping",
    phone: null,
    whatsapp: null,
    email: null,
  });
  assert.equal(prepared.counts.configuredDepartments, 1);
  assert.match(prepared.communicationsHash, /^[a-f0-9]{64}$/);
});

test("STEP 2D keeps legacy top-level whatsapp/email readable without making them canonical", () => {
  const candidate = blueprint();
  candidate.departments[0] = {
    id: "reception",
    name: "Reception",
    hours: { is24h: true },
    whatsapp: "+49 151 000000",
    email: "legacy@example.com",
  };

  const prepared = prepareFactoryCommunications({ blueprint: candidate });
  assert.equal(prepared.communications.department_contacts[0].whatsapp, "+49 151 000000");
  assert.equal(prepared.communications.department_contacts[0].email, "legacy@example.com");
});

test("STEP 2D rejects invalid email before immutable foundation creation", () => {
  const candidate = blueprint();
  candidate.departments[0].contact.email = "not-an-email";
  assert.throws(
    () => prepareFactoryCommunications({ blueprint: candidate }),
    /P2D_COMMUNICATION_INVALID:reception.email/,
  );
});

test("STEP 2D canonical contacts materialize into existing Guest runtime contacts", () => {
  const runtime = prepareFactoryGuestRuntimeConfig({ blueprint: blueprint() });
  assert.deepEqual(runtime.config.contacts.reception, {
    phone: "+49 30 123456",
    whatsapp: "+49 151 12345678",
    email: "reception@example.com",
  });
  assert.deepEqual(runtime.config.contacts.housekeeping, {});
});

test("STEP 2D Smart Setup and authoritative boundaries validate communications", async () => {
  const wizard = await readProjectFile(
    "app/control-plane/factory/new/FactoryBlueprintWizard.tsx",
  );
  const ui = await readProjectFile(
    "app/control-plane/factory/new/FactoryCommunicationsStep.tsx",
  );
  const preflight = await readProjectFile(
    "app/api/control-plane/onboarding/preflight/route.ts",
  );
  const server = await readProjectFile("lib/server/factory-onboarding.ts");

  assertContains(wizard, "FactoryCommunicationsStep");
  assertContains(wizard, "validateCommunicationDepartments");
  assertContains(wizard, "contact:");
  assertContains(wizard, "phone: department.phone.trim()");
  assertContains(wizard, "whatsapp: department.whatsapp.trim()");
  assertContains(wizard, "email: department.email.trim()");
  assertContains(ui, "guest-facing phone, WhatsApp, and email channels");
  assertContains(ui, "Venue reservation contacts stay in Native Venues");
  assertContains(preflight, "prepareFactoryCommunications");
  assertContains(preflight, "communicationsHash");
  assertContains(server, "prepareFactoryCommunications");
  assertContains(server, "P2D_COMMUNICATION_BLUEPRINT_HASH_DRIFT");
  assertNotContains(server, "manager_pin");
  assertNotContains(server, "staff_sessions");
});

test("STEP 2D does not introduce a parallel venue or messaging authority", async () => {
  const model = await readProjectFile(
    "lib/product-factory/factory-communications-model.mjs",
  );
  assertContains(model, "department_contacts");
  assertNotContains(model, "venue_contacts");
  assertNotContains(model, "guest_requests");
  assertNotContains(model, "notifications");
});

test("Production direct guest communications reuse Guest Communications with exact hotel/stay/device guards", async () => {
  const staffRoute = await readProjectFile("app/api/staff/guest-direct-communications/route.ts");
  const guestRoute = await readProjectFile("app/api/guest/communications/route.ts");
  const staffShell = await readProjectFile("components/staff/StaffHotelShell.tsx");
  const guestInbox = await readProjectFile("components/GuestCommunicationsInbox.tsx");
  const policy = await readProjectFile("lib/server/guest-communications-delivery-policy.ts");
  const delivery = await readProjectFile("lib/server/guest-direct-communications-delivery.ts");
  const migration = await readProjectFile("supabase/migrations/20260903061000_guest_direct_communications.sql");

  assertContains(staffRoute, 'access.role !== "reception"');
  assertContains(staffRoute, 'guestCommunicationsDeliveryEnabledForHotel(access.hotel.id)');
  assertContains(staffRoute, 'append_guest_direct_communication_v1');
  assertContains(staffRoute, '.eq("hotel_id", access.hotel.id)');
  assertContains(staffRoute, '.eq("audience_type", "direct_guest")');
  assertContains(guestRoute, '.eq("stay_id", stayResult.stay.id)');
  assertContains(guestRoute, 'p_stay_device_id: stayResult.stay.stayDeviceId');
  assertContains(guestRoute, 'direct_thread_not_open');
  assertContains(staffShell, 'role === "reception"');
  assertContains(guestInbox, 'action: "reply"');
  assertContains(policy, 'guest_communications_delivery_enabled');
  assertContains(delivery, '.eq("stay_id", input.communication.stay_id)');
  assertContains(delivery, 'sandbox_delivery_disabled');
  assertContains(migration, "'direct_guest'");
  assertContains(migration, 'GUEST_DIRECT_COMMUNICATION_STAY_INVALID');
  assertContains(migration, 'GUEST_COMMUNICATION_DEVICE_MISMATCH');
  assertContains(migration, 'to service_role');
  assertNotContains(staffRoute, 'all_active_guests');
});
