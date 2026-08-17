import crypto from "node:crypto";

import { prepareFactoryOperationalResources } from "./factory-operational-resources-model.mjs";
import { prepareFactoryOnboarding, stableFactoryJson } from "./factory-onboarding-model.mjs";

const AI_ACTION_CLASSES = ["READ", "SUGGEST", "CONFIRM", "STAFF_APPROVAL", "MANAGER_APPROVAL"];

function hashValue(value) {
  return crypto.createHash("sha256").update(stableFactoryJson(value)).digest("hex");
}

function jsonClone(value) {
  return JSON.parse(stableFactoryJson(value));
}

export function prepareFactoryOnboardingEnvelope({ blueprint }) {
  const operational = prepareFactoryOperationalResources({ blueprint });
  const onboarding = prepareFactoryOnboarding({
    blueprint,
    idempotencyKey: "p2.4:onboarding-envelope:prepare",
  });
  const normalizedBlueprint = operational.blueprint;
  const departments = normalizedBlueprint.departments;

  const roleTemplates = [
    {
      key: "hotel-admin",
      display_name: "Hotel Admin",
      scope: "hotel_admin",
      department_code: null,
      permissions_json: { configured: false, permissions: [] },
      runtime_enabled: false,
    },
    {
      key: "manager",
      display_name: "Manager",
      scope: "manager",
      department_code: null,
      permissions_json: { configured: false, permissions: [] },
      runtime_enabled: false,
    },
    {
      key: "reception",
      display_name: "Reception",
      scope: "department",
      department_code: departments.some((department) => department.id === "reception")
        ? "reception"
        : null,
      permissions_json: { configured: false, permissions: [] },
      runtime_enabled: false,
    },
    ...departments
      .filter((department) => department.id !== "reception")
      .map((department) => ({
        key: `department-${department.id}`,
        display_name: department.name,
        scope: "department",
        department_code: department.id,
        permissions_json: { configured: false, permissions: [] },
        runtime_enabled: false,
      })),
  ];

  const reporting = {
    enabled: false,
    timezone: normalizedBlueprint.property.timezone,
    recipients: [],
    schedules: {},
  };

  const branding = {
    status: "placeholder",
    display_name: normalizedBlueprint.property.name,
    logo_url: null,
    icon_url: null,
    theme: {},
  };

  const knowledge = {
    status: "placeholder",
    locales: [...normalizedBlueprint.property.locales],
    facts: [],
    policies: [],
  };

  const aiPermissions = {
    status: "pending",
    actions: Object.fromEntries(AI_ACTION_CLASSES.map((action) => [action, false])),
  };

  const publicIdentities = {
    production: {
      public_slug: onboarding.identities.productionPublicSlug,
      hotel_slug: onboarding.identities.productionSlug,
      guest_route: `/h/${onboarding.identities.productionPublicSlug}`,
      qr_route: `/qr/${onboarding.identities.productionPublicSlug}`,
      staff_qr_prefix: `/qr/staff/${onboarding.identities.productionSlug}`,
      status: "reserved",
    },
    sandbox: {
      public_slug: onboarding.identities.sandboxPublicSlug,
      hotel_slug: onboarding.identities.sandboxSlug,
      guest_route: `/h/${onboarding.identities.sandboxPublicSlug}`,
      qr_route: `/qr/${onboarding.identities.sandboxPublicSlug}`,
      staff_qr_prefix: `/qr/staff/${onboarding.identities.sandboxSlug}`,
      status: "reserved",
    },
  };

  const health = {
    status: "pending",
    certification_status: "not_started",
    checks: {
      tenant_isolation: "pending",
      runtime_projection: "pending",
      staff_runtime: "pending",
      integrations: "pending",
      reporting: "pending",
      sandbox_smoke: "pending",
    },
  };

  const envelope = {
    schema_version: "p2.4",
    role_templates: jsonClone(roleTemplates),
    reporting,
    branding,
    knowledge,
    ai_permissions: aiPermissions,
    public_identities: publicIdentities,
    health,
  };

  return {
    blueprint: normalizedBlueprint,
    blueprintHash: operational.blueprintHash,
    coreResourcesHash: operational.coreResourcesHash,
    operationalResourcesHash: operational.operationalResourcesHash,
    envelope,
    envelopeHash: hashValue(envelope),
    counts: {
      roleTemplates: roleTemplates.length,
      reportingRecipients: 0,
      knowledgeFacts: 0,
      knowledgePolicies: 0,
      enabledAiActions: 0,
      reservedPublicIdentities: 2,
    },
  };
}
