import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const targetCellKey = "sandbox-standard-01";
const expectedOperations = 96;
const expectedHotels = 16;
const expectedAppSha = String(process.env.STAYHUB_CELL_EXPECTED_APP_SHA || "").trim();
const baseUrl = String(process.env.STAYHUB_620_BASE_URL || "").replace(/\/$/, "");
const runId = String(
  process.env.STAYHUB_620_RUN_ID || `factory-heavy-20260901-cell-01-96-${Date.now()}`,
);
const authMode = String(process.env.STAYHUB_VERCEL_TRUSTED_OIDC_TOKEN || "").trim()
  ? "vercel_trusted_oidc"
  : String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "").trim()
    ? "vercel_automation_bypass"
    : "none";

if (!/^[0-9a-f]{40}$/i.test(expectedAppSha)) {
  throw new Error("STAYHUB_CELL_EXPECTED_APP_SHA must be the exact 40-character Preview app SHA");
}
if (!baseUrl) throw new Error("STAYHUB_620_BASE_URL is required");
const targetUrl = new URL(baseUrl);
if (!targetUrl.hostname.endsWith(".vercel.app")) {
  throw new Error(`Refusing Cell 01 acceptance outside an exact Vercel Preview URL: ${targetUrl.hostname}`);
}
if (authMode === "none") {
  throw new Error("Cell 01 acceptance requires protected Preview authentication");
}

const here = dirname(fileURLToPath(import.meta.url));
const canonicalHarness = resolve(here, "factory-final-620-peak.mjs");
const authPreload = resolve(here, "vercel-preview-auth-preload.mjs");
const startedAt = new Date().toISOString();

function extractJsonObject(text, marker, fromIndex = 0) {
  const markerIndex = text.indexOf(marker, fromIndex);
  if (markerIndex < 0) return null;
  const start = text.lastIndexOf("{", markerIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const raw = text.slice(start, index + 1);
        try {
          return { value: JSON.parse(raw), endIndex: index + 1 };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function evaluateCell(summary) {
  const failures = [];
  const expect = (condition, message) => {
    if (!condition) failures.push(message);
  };

  expect(summary?.phase === "cell-complete", "missing cell-complete phase");
  expect(summary?.cellKey === targetCellKey, `unexpected cell ${summary?.cellKey || "missing"}`);
  expect(summary?.hotelCount === expectedHotels, `expected ${expectedHotels} hotels, got ${summary?.hotelCount}`);
  expect(summary?.totalOperations === expectedOperations, `expected ${expectedOperations} operations, got ${summary?.totalOperations}`);
  expect(summary?.request?.total === 48 && summary?.request?.failed === 0, "request correctness failed");
  expect(summary?.survey?.total === 32 && summary?.survey?.failed === 0, "survey correctness failed");
  expect(summary?.massageUnique?.total === 16 && summary?.massageUnique?.failed === 0, "massage correctness failed");
  expect(summary?.massageContention?.total === 0, "Cell 01 must not run contention operations");
  expect(summary?.correctnessAccepted === true, "canonical correctness gate failed");
  expect(summary?.performanceAccepted === true, "canonical performance gate failed");
  expect(summary?.accepted === true, "canonical Cell 01 gate failed");
  expect(Array.isArray(summary?.failures) && summary.failures.length === 0, "unexpected operation failures");
  expect(
    Array.isArray(summary?.contentionUnexpected) && summary.contentionUnexpected.length === 0,
    "unexpected contention failures",
  );

  return { accepted: failures.length === 0, failures };
}

const child = spawn(
  process.execPath,
  ["--import", pathToFileURL(authPreload).href, canonicalHarness],
  {
    env: {
      ...process.env,
      STAYHUB_620_RUN_ID: runId,
      // The canonical harness prints the complete Cell 01 summary before its inter-cell cooldown.
      // A long cooldown guarantees this wrapper can stop it before Cell 02 starts.
      STAYHUB_620_GROUP_COOLDOWN_MS: "600000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let stdout = "";
let stderr = "";
let finished = false;
let resolveResult;
let rejectResult;
const resultPromise = new Promise((resolvePromise, rejectPromise) => {
  resolveResult = resolvePromise;
  rejectResult = rejectPromise;
});

const timeout = setTimeout(() => {
  if (finished) return;
  finished = true;
  child.kill("SIGTERM");
  rejectResult(new Error("Timed out waiting for canonical Cell 01 summary"));
}, 240000);

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  stdout += text;
  process.stdout.write(text);

  if (finished) return;
  const extracted = extractJsonObject(stdout, '"phase": "cell-complete"');
  if (!extracted || extracted.value?.cellKey !== targetCellKey) return;

  const evaluation = evaluateCell(extracted.value);
  const evidence = {
    schemaVersion: "stayhub-factory-cell-01-96-v1",
    runId,
    sourceAppSha: expectedAppSha,
    authMode,
    baseUrl,
    startedAt,
    completedAt: new Date().toISOString(),
    cellKey: targetCellKey,
    expectedTotalOperations: expectedOperations,
    summary: extracted.value,
    accepted: evaluation.accepted,
    failures: evaluation.failures,
  };

  finished = true;
  clearTimeout(timeout);
  void writeFile("factory-cell-01-96-results.json", `${JSON.stringify(evidence, null, 2)}\n`)
    .then(() => {
      child.kill("SIGTERM");
      resolveResult(evidence);
    })
    .catch((error) => {
      child.kill("SIGTERM");
      rejectResult(error);
    });
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  stderr += text;
  process.stderr.write(text);
});

child.on("error", (error) => {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  rejectResult(error);
});

child.on("exit", (code, signal) => {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  rejectResult(
    new Error(
      `Canonical harness exited before Cell 01 evidence (code=${code}, signal=${signal || "none"})${stderr ? `: ${stderr.slice(-1000)}` : ""}`,
    ),
  );
});

const evidence = await resultPromise;
console.log(JSON.stringify(evidence, null, 2));
if (!evidence.accepted) process.exitCode = 1;
