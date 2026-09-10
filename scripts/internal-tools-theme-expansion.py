from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


# The first hardening patch creates the component under control-plane. Move it
# to one neutral shared location so every internal tool uses exactly one shell.
source = ROOT / "app/control-plane/ToolsThemeShell.tsx"
if not source.exists():
    raise SystemExit("generated ToolsThemeShell is missing")
shared = read("app/control-plane/ToolsThemeShell.tsx")
write("components/internal-tools/ToolsThemeShell.tsx", shared)
source.unlink()

write(
    "app/control-plane/layout.tsx",
    'import ToolsThemeShell from "@/components/internal-tools/ToolsThemeShell";\n\n'
    'export default function ControlPlaneLayout({ children }: { children: React.ReactNode }) {\n'
    '  return <ToolsThemeShell>{children}</ToolsThemeShell>;\n'
    '}\n',
)

for route, fn in [
    ("hotel-factory", "HotelFactoryLayout"),
    ("hotel-scanner", "HotelScannerLayout"),
    ("design-studio", "DesignStudioLayout"),
    ("control-panel", "ControlPanelLayout"),
]:
    write(
        f"app/{route}/layout.tsx",
        'import ToolsThemeShell from "@/components/internal-tools/ToolsThemeShell";\n\n'
        f'export default function {fn}({{ children }}: {{ children: React.ReactNode }}) {{\n'
        '  return <ToolsThemeShell>{children}</ToolsThemeShell>;\n'
        '}\n',
    )

css_path = "app/globals.css"
css = read(css_path)
anchor = '''.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-800\/50 {\n  background-color: #edf1f2 !important;\n}\n'''.replace('\\n', '\n')
extra = anchor + '''\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-black\/20,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-black\/30,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-black\/40,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-black\/50 {\n  background-color: rgba(239, 244, 246, 0.92) !important;\n}\n\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .border-white\/10,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .border-white\/15,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .border-white\/20 {\n  border-color: #d3dde0 !important;\n}\n'''.replace('\\n', '\n')
if anchor not in css:
    raise SystemExit("theme CSS expansion anchor missing")
css = css.replace(anchor, extra, 1)
write(css_path, css)

# Strengthen the generated contract so "all tools" cannot silently regress to
# only the /control-plane route in a later change.
test_path = "tests/contracts/control-plane-tools-theme.contract.test.mjs"
test = read(test_path)
write(test_path, r'''import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

const INTERNAL_TOOL_LAYOUTS = [
  "app/control-plane/layout.tsx",
  "app/hotel-factory/layout.tsx",
  "app/hotel-scanner/layout.tsx",
  "app/design-studio/layout.tsx",
  "app/control-panel/layout.tsx",
];

test("all internal StayHub tool trees inherit one persisted light-dark theme shell", async () => {
  const shell = await readProjectFile("components/internal-tools/ToolsThemeShell.tsx");
  const css = await readProjectFile("app/globals.css");

  for (const path of INTERNAL_TOOL_LAYOUTS) {
    const layout = await readProjectFile(path);
    assert.match(layout, /@\/components\/internal-tools\/ToolsThemeShell/, path);
    assert.match(layout, /<ToolsThemeShell>/, path);
  }

  assert.match(shell, /stayhub\.control-plane\.theme\.v1/);
  assert.match(shell, /data-stayhub-tools-theme/);
  assert.match(shell, /"light"/);
  assert.match(shell, /"dark"/);
  assert.match(css, /StayHub internal tools shared light\/dark theme v1/);
  assert.match(css, /stayhub-tools-shell\[data-stayhub-tools-theme="light"\]/);
  assert.match(css, /\.bg-neutral-950/);
  assert.match(css, /\.bg-black\\\/20/);
  assert.match(css, /\.border-white\\\/10/);
  assert.match(css, /\.text-neutral-100/);
});
''')

print("Shared theme expanded across all internal StayHub tool route trees")
