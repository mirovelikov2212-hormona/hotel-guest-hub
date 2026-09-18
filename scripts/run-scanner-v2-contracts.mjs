import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const contractsDir = join(process.cwd(), "tests", "contracts");
const files = readdirSync(contractsDir)
  .filter((name) => /^hotel-scanner-v2-.*\.contract\.test\.mjs$/u.test(name))
  .sort()
  .map((name) => join("tests", "contracts", name));

if (!files.length) {
  console.error("No Scanner V2 contract tests found.");
  process.exit(1);
}

console.log(`Running ${files.length} Scanner V2 contract files...`);
const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
