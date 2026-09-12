import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

const SHARED_LAYOUTS = [
  "app/control-plane/layout.tsx",
  "app/hotel-factory/layout.tsx",
  "app/hotel-scanner/layout.tsx",
  "app/design-studio/layout.tsx",
];

test("all internal StayHub tool trees share one persisted light-dark preference without nested toggles", async () => {
  const shell = await readProjectFile("components/internal-tools/ToolsThemeShell.tsx");
  const controlPanelShell = await readProjectFile("components/control-panel/ControlPanelThemeShell.tsx");
  const controlPanelPage = await readProjectFile("app/control-panel/page.tsx");
  const css = await readProjectFile("app/globals.css");

  for (const path of SHARED_LAYOUTS) {
    const layout = await readProjectFile(path);
    assert.match(layout, /@\/components\/internal-tools\/ToolsThemeShell/, path);
    assert.match(layout, /<ToolsThemeShell>/, path);
  }

  assert.match(shell, /stayhub\.internal-tools\.theme\.v1/);
  assert.match(shell, /data-stayhub-tools-theme/);
  assert.match(shell, /"light"/);
  assert.match(shell, /"dark"/);
  assert.match(controlPanelShell, /stayhub\.internal-tools\.theme\.v1/);
  assert.match(controlPanelPage, /<ControlPanelThemeShell>/);
  assert.doesNotMatch(controlPanelPage, /ToolsThemeShell/);

  assert.match(css, /StayHub internal tools shared light\/dark theme v1/);
  assert.match(css, /stayhub-tools-shell\[data-stayhub-tools-theme="light"\]/);
  assert.match(css, /\.bg-neutral-950/);
  assert.match(css, /\.bg-black\\\/20/);
  assert.match(css, /\.border-white\\\/10/);
  assert.match(css, /\.text-cyan-50/);
  assert.match(css, /\.text-neutral-100/);
});

test("Hotel Scanner light mode has an explicit route-scoped surface hierarchy", async () => {
  const layout = await readProjectFile("app/hotel-scanner/layout.tsx");
  const page = await readProjectFile("app/hotel-scanner/page.tsx");
  const scannerTheme = await readProjectFile("app/hotel-scanner/scanner-theme.css");

  assert.match(layout, /import "\.\/scanner-theme\.css"/);
  assert.match(page, /hotel-scanner-page/);
  assert.match(page, /hotel-scanner-workspace/);
  assert.match(scannerTheme, /data-stayhub-tools-theme="light"/);
  assert.match(scannerTheme, /\.hotel-scanner-workspace > section/);
  assert.match(scannerTheme, /background: rgba\(255, 255, 255, 0\.97\)/);
  assert.match(scannerTheme, /\.hotel-scanner-workspace section section/);
  assert.doesNotMatch(scannerTheme, /data-stayhub-tools-theme="dark"/);
});
