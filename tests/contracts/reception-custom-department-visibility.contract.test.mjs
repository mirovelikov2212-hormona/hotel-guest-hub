import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Reception keeps every tenant department visible while operational authority stays fail-closed", async () => {
  const source = await readProjectFile("components/staff/pages/ReceptionPageContent.tsx");

  assertContains(source, "function isReceptionOperationalDepartment(department: string)");
  assertContains(source, "filteredRequests.length ? (");
  assertContains(source, "filteredRequests.map((request) => {");
  assertContains(source, "const canReceptionAct = isReceptionOperationalDepartment(request.department);");
  assertContains(source, "canAct={canReceptionAct}");
  assertContains(source, "canCharge={canReceptionAct && Boolean(request.requiresBilling)}");
  assertNotContains(
    source,
    "const actionableRequests = useMemo(",
    "Reception visibility must not drop tenant-defined departments before rendering.",
  );
});

test("shared request cards style tenant-defined department codes through the generic fallback", async () => {
  const source = await readProjectFile("components/staff/StaffRequestCard.tsx");

  assertContains(source, "getStaffDepartmentClass");
  assertContains(source, "getStaffDepartmentClass(request.department)");
  assertNotContains(
    source,
    "staffDepartmentClasses[request.department]",
    "Custom department badges must use the generic department class fallback.",
  );
});
