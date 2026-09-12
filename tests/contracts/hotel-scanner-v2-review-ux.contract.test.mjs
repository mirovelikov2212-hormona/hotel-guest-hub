import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("Scanner V2 uses the shared internal-tools light-dark theme", async () => {
  const layout = await readProjectFile("app/hotel-scanner-v2/layout.tsx");
  const styles = await readProjectFile("app/hotel-scanner-v2/scanner-v2.css");

  assert.match(layout, /ToolsThemeShell/);
  assert.match(layout, /scanner-v2\.css/);
  assert.match(styles, /data-stayhub-tools-theme="dark"/);
  assert.match(styles, /--v2-surface: #ffffff/);
});

test("Scanner V2 presents a guided review instead of a developer-only evidence dump", async () => {
  const client = await readProjectFile("app/hotel-scanner-v2/HotelScannerV2Client.tsx");
  const details = await readProjectFile("app/hotel-scanner-v2/HotelScannerV2Details.tsx");

  assert.match(client, /Discovery/);
  assert.match(client, /Inventory/);
  assert.match(client, /Extracted data/);
  assert.match(client, /Conflicts & gaps/);
  assert.match(client, /Approval/);
  assert.match(client, /Expected/);
  assert.match(client, /Identified/);
  assert.match(client, /Extracted/);
  assert.match(details, /Източници|Sources/);
  assert.match(details, /Inventory source details/);
  assert.match(details, /entityTypeLabel/);
});

test("technical diagnostics remain available but collapsed away from the primary review flow", async () => {
  const client = await readProjectFile("app/hotel-scanner-v2/HotelScannerV2Client.tsx");

  assert.match(client, /<details className="v2-details v2-panel/);
  assert.match(client, /Rejected same-document conflicts/);
  assert.match(client, /Multi-source verified/);
});
