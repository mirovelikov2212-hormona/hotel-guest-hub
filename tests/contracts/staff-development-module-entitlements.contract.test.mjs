import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCommercialModuleConfig,
  resolveProductModuleAccess,
} from "../../lib/commercial/product-module-entitlements.mjs";

test("legacy and non-production compatibility keep existing modules available", () => {
  for (const effectiveStatus of ["legacy_unmanaged", "non_production_bypass"]) {
    const resolved = resolveProductModuleAccess({
      commercial: {
        effectiveStatus,
        accessAllowed: true,
        planCode: null,
      },
      config: null,
    });

    assert.equal(resolved.moduleAccess.guest_hub, true);
    assert.equal(resolved.moduleAccess.staff_operations, true);
    assert.equal(resolved.moduleAccess.operational_ai, true);
    assert.equal(resolved.moduleAccess.staff_development, true);
    assert.equal(resolved.moduleAccess.manager_intelligence, true);
    assert.equal(resolved.moduleAccess.revenue_intelligence, true);
    assert.equal(resolved.moduleAccess.integration_layer, true);
  }
});

test("full_trial enables every product module without a stored module config", () => {
  const resolved = resolveProductModuleAccess({
    commercial: {
      effectiveStatus: "trial_active",
      accessAllowed: true,
      planCode: "full_trial",
    },
    config: null,
  });

  assert.equal(resolved.source, "full_trial");
  assert.equal(resolved.enabledModules.length, 7);
  assert.equal(resolved.moduleAccess.manager_intelligence, true);
  assert.equal(resolved.moduleAccess.revenue_intelligence, true);
  assert.equal(resolved.moduleAccess.integration_layer, true);
});

test("managed customer defaults to Guest Hub only until optional modules are explicit", () => {
  const resolved = resolveProductModuleAccess({
    commercial: {
      effectiveStatus: "customer_active",
      accessAllowed: true,
      planCode: "contract-a",
    },
    config: null,
  });

  assert.equal(resolved.source, "core_only_default");
  assert.equal(resolved.moduleAccess.guest_hub, true);
  assert.equal(resolved.moduleAccess.staff_operations, false);
  assert.equal(resolved.moduleAccess.staff_development, false);
  assert.equal(resolved.moduleAccess.manager_intelligence, false);
  assert.equal(resolved.moduleAccess.revenue_intelligence, false);
  assert.equal(resolved.moduleAccess.integration_layer, false);
});

test("module config enforces capability dependencies", () => {
  assert.throws(
    () =>
      buildCommercialModuleConfig({
        currentRevision: 0,
        enabledModules: ["manager_intelligence"],
      }),
    /COMMERCIAL_MODULE_DEPENDENCY_MISSING/,
  );

  assert.throws(
    () =>
      buildCommercialModuleConfig({
        currentRevision: 0,
        enabledModules: ["revenue_intelligence"],
      }),
    /COMMERCIAL_MODULE_DEPENDENCY_MISSING/,
  );

  const integrationOnly = buildCommercialModuleConfig({
    currentRevision: 0,
    enabledModules: ["integration_layer"],
  });
  assert.deepEqual(integrationOnly.enabledModules, ["integration_layer"]);


  const config = buildCommercialModuleConfig({
    currentRevision: 3,
    enabledModules: [
      "staff_operations",
      "staff_development",
      "manager_intelligence",
    ],
  });

  assert.equal(config.revision, 4);
  assert.deepEqual(config.enabledModules, [
    "manager_intelligence",
    "staff_development",
    "staff_operations",
  ]);
});

test("commercial denial disables every module", () => {
  const resolved = resolveProductModuleAccess({
    commercial: {
      effectiveStatus: "suspended",
      accessAllowed: false,
      planCode: "contract-a",
    },
    config: {
      schemaVersion: "commercial-module-entitlements-v1",
      revision: 1,
      enabledModules: [
        "staff_operations",
        "staff_development",
        "manager_intelligence",
      ],
    },
  });

  assert.equal(resolved.moduleAccess.guest_hub, false);
  assert.equal(resolved.moduleAccess.staff_development, false);
  assert.equal(resolved.moduleAccess.manager_intelligence, false);
  assert.equal(resolved.moduleAccess.integration_layer, false);
});

test("runtime module config is hotel-scoped and Control Plane writes are Platform Admin audited", () => {
  const runtime = readFileSync(
    new URL("../../lib/server/product-module-entitlements.ts", import.meta.url),
    "utf8",
  );
  const control = readFileSync(
    new URL("../../lib/server/property-module-entitlements.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL(
      "../../app/api/control-plane/commercial/module-entitlements/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(runtime, /\.eq\("hotel_id", hotelId\)/);
  assert.match(runtime, /\.eq\("key", MODULE_SETTING_KEY\)/);
  assert.match(control, /canMutateControlPlane\(input\.authority\.role\)/);
  assert.match(control, /COMMERCIAL_MODULE_REVISION_CONFLICT/);
  assert.match(control, /\.eq\("updated_at", currentRow\.updated_at\)/);
  assert.match(control, /logControlPlaneAudit/);
  assert.match(route, /getCurrentPlatformAdminSession\(\)/);
  assert.match(route, /enforceControlPlaneSameOrigin\(req\)/);
});

test("Staff Development and Manager Intelligence are server-gated by module entitlement", () => {
  const identity = readFileSync(
    new URL("../../lib/server/staff-development-identity.ts", import.meta.url),
    "utf8",
  );
  const analysis = readFileSync(
    new URL("../../lib/server/staff-hr-ai-analysis.ts", import.meta.url),
    "utf8",
  );
  const reporting = readFileSync(
    new URL("../../lib/server/staff-development-reporting.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    identity,
    /requireHotelProductModuleAccess\(identity\.hotelId, "staff_development"\)/,
  );
  assert.match(identity, /"staff_development"/);
  assert.match(analysis, /"manager_intelligence"/);
  assert.match(reporting, /"manager_intelligence"/);
});

test("Control Plane module UI keeps entitlement management outside hotel Manager authority", () => {
  const panel = readFileSync(
    new URL(
      "../../app/control-plane/CommercialModuleEntitlementsPanel.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(panel, /Platform Admin entitlement/);
  assert.match(panel, /expectedRevision: config\.revision/);
  assert.match(panel, /staff_development/);
  assert.match(panel, /manager_intelligence/);
  assert.match(panel, /revenue_intelligence/);
  assert.match(panel, /integration_layer/);
  assert.match(panel, /addWithDependencies/);
  assert.match(panel, /removeWithDependents/);
});


test("Staff Operations and Operational AI have server-side runtime enforcement", () => {
  const session = readFileSync(
    new URL("../../lib/staff-auth/session.ts", import.meta.url),
    "utf8",
  );
  const staffLogin = readFileSync(
    new URL("../../app/api/staff/auth/login/route.ts", import.meta.url),
    "utf8",
  );
  const departmentLogin = readFileSync(
    new URL(
      "../../app/api/staff/auth/department-login/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const aiRoute = readFileSync(
    new URL("../../app/api/ai/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(session, /requireHotelProductModuleAccess\(data\.hotel_id, "staff_operations"\)/);
  assert.match(session, /isProductModuleAccessDeniedError/);
  assert.match(staffLogin, /"staff_operations"/);
  assert.match(staffLogin, /STAFF_OPERATIONS_NOT_ENTITLED/);
  assert.match(departmentLogin, /"staff_operations"/);
  assert.match(departmentLogin, /STAFF_OPERATIONS_NOT_ENTITLED/);
  assert.match(aiRoute, /requireHotelProductModuleAccess\(hotel\.id, "operational_ai"\)/);
  assert.match(aiRoute, /ai_module_not_entitled/);
});
