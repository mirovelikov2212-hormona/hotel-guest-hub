import { resolve } from "node:path";
import {
  scanTenantQueriesInDirectories,
  summarizeTenantQueryFindings,
} from "../tests/helpers/tenant-query-scanner.mjs";

const projectRoot = resolve(process.cwd());
const jsonMode = process.argv.includes("--json");
const findings = await scanTenantQueriesInDirectories({ projectRoot });
const summary = summarizeTenantQueryFindings(findings);

if (jsonMode) {
  process.stdout.write(`${JSON.stringify({ summary, findings }, null, 2)}\n`);
  process.exit(0);
}

console.log("StayHub tenant query inventory");
console.log(`Total queries: ${summary.total}`);
console.log("");

for (const finding of findings) {
  const target = finding.table || (finding.rpc ? `rpc:${finding.rpc}` : finding.tableExpression || "dynamic");
  const reason = finding.reasons.length ? ` -- ${finding.reasons.join(", ")}` : "";
  console.log(`[${finding.status}] ${finding.filePath}:${finding.line} ${target} ${finding.operation}${reason}`);
}

console.log("");
console.log("Summary by status:");
for (const [status, count] of Object.entries(summary.byStatus).sort()) {
  console.log(`  ${status}: ${count}`);
}
console.log("");
console.log("This command is inventory-only and always exits with code 0.");
