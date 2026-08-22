import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

const EVIDENCE = "lib/server/factory-production-runtime-certification-evidence.ts";

test("P2.6.3 recertification reuses immutable P2.6.1 readiness evidence", async () => {
  const evidence = await readProjectFile(EVIDENCE);

  assertContains(evidence, "requireStoredReadinessEvidence");
  assertContains(evidence, 'evidence.schemaVersion !== "p2.6.1-trusted-readiness-evidence-v1"');
  assertContains(evidence, 'evidence.source !== "system_derived"');
  assertContains(evidence, "P2_6_3_STORED_READINESS_EVIDENCE_INVALID");
  assertContains(evidence, "readinessEvidenceHash: String(readiness.evidence_hash).toLowerCase()");
  assertContains(evidence, '.from("factory_production_runtime_certification_runs")');
  assertContains(evidence, 'const certificationMode = previousCertification ? "recertification" : "initial"');
  assertContains(evidence, 'certificationMode === "recertification" && publicIdentityStatus !== "certified"');
  assertContains(evidence, "priorCertification: previousCertification ?");
  assertContains(evidence, "readinessEvidence.envelopeProjectionRunId");
  assertNotContains(evidence, "deriveFactoryProductionReadinessEvidence");
});
