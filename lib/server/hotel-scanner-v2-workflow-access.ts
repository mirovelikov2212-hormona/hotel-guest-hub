import "server-only";

import crypto from "node:crypto";

type ScannerV2WorkflowAccess = {
  actorAdminId: string;
  runId: string;
  scanRunId: string;
};

function getWorkflowAccessSecret() {
  const secret = String(process.env.STAFF_SESSION_SECRET || "").trim();
  if (!secret) throw new Error("Missing STAFF_SESSION_SECRET");
  return secret;
}

function workflowAccessPayload(input: ScannerV2WorkflowAccess) {
  return [
    "stayhub:scanner-v2-workflow:v1",
    input.actorAdminId,
    input.scanRunId,
    input.runId,
  ].join(":");
}

export function createScannerV2WorkflowAccessToken(input: ScannerV2WorkflowAccess) {
  return crypto
    .createHmac("sha256", getWorkflowAccessSecret())
    .update(workflowAccessPayload(input))
    .digest("base64url");
}

export function verifyScannerV2WorkflowAccessToken(
  input: ScannerV2WorkflowAccess,
  token: string,
) {
  const supplied = String(token || "").trim();
  if (!supplied) return false;

  const expected = createScannerV2WorkflowAccessToken(input);
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
