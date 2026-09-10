from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARED_STORAGE_KEY = "stayhub.internal-tools.theme.v1"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


# The base patch creates the shell under /control-plane. Move that exact shell
# to a neutral shared component and give all internal tools one theme key.
source = ROOT / "app/control-plane/ToolsThemeShell.tsx"
if not source.exists():
    raise SystemExit("generated ToolsThemeShell is missing")
shared = read("app/control-plane/ToolsThemeShell.tsx").replace(
    "stayhub.control-plane.theme.v1",
    SHARED_STORAGE_KEY,
)
write("components/internal-tools/ToolsThemeShell.tsx", shared)
source.unlink()

write(
    "app/control-plane/layout.tsx",
    'import ToolsThemeShell from "@/components/internal-tools/ToolsThemeShell";\n\n'
    'export default function ControlPlaneLayout({ children }: { children: React.ReactNode }) {\n'
    '  return <ToolsThemeShell>{children}</ToolsThemeShell>;\n'
    '}\n',
)

# These dark-first operator tools did not previously have a light-mode shell.
for route, fn in [
    ("hotel-factory", "HotelFactoryLayout"),
    ("hotel-scanner", "HotelScannerLayout"),
    ("design-studio", "DesignStudioLayout"),
]:
    write(
        f"app/{route}/layout.tsx",
        'import ToolsThemeShell from "@/components/internal-tools/ToolsThemeShell";\n\n'
        f'export default function {fn}({{ children }}: {{ children: React.ReactNode }}) {{\n'
        '  return <ToolsThemeShell>{children}</ToolsThemeShell>;\n'
        '}\n',
    )

# /control-panel already has a polished variable-driven Light/Dark shell.
# Reuse it, but make it share the same persisted preference instead of adding
# a second nested shell/toggle.
cp_theme_path = "components/control-panel/ControlPanelThemeShell.tsx"
cp_theme = read(cp_theme_path)
if 'const STORAGE_KEY = "stayhub:control-panel-theme:v1";' not in cp_theme:
    raise SystemExit("control panel theme storage marker missing")
cp_theme = cp_theme.replace(
    'const STORAGE_KEY = "stayhub:control-panel-theme:v1";',
    f'const STORAGE_KEY = "{SHARED_STORAGE_KEY}";',
    1,
)
write(cp_theme_path, cp_theme)

css_path = "app/globals.css"
css = read(css_path)
anchor = '''.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-800\/50 {\n  background-color: #edf1f2 !important;\n}\n'''.replace('\\n', '\n')
extra = anchor + '''\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-black\/20,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-black\/30,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-black\/40,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-black\/50 {\n  background-color: rgba(239, 244, 246, 0.92) !important;\n}\n\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .border-white\/10,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .border-white\/15,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .border-white\/20 {\n  border-color: #d3dde0 !important;\n}\n'''.replace('\\n', '\n')
if anchor not in css:
    raise SystemExit("theme CSS expansion anchor missing")
css = css.replace(anchor, extra, 1)

# Accent text that was designed for a black surface must remain readable on a
# white surface. Keep semantic accent identity but use accessible darker tones.
css = css.replace(
    '''.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-cyan-100,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-cyan-200,'''.replace('\\n', '\n'),
    '''.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-cyan-50,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-cyan-100,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-cyan-200,'''.replace('\\n', '\n'),
    1,
)
css = css.replace(
    '''.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-emerald-100,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-emerald-200,'''.replace('\\n', '\n'),
    '''.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-emerald-50,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-emerald-100,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-emerald-200,'''.replace('\\n', '\n'),
    1,
)
css = css.replace(
    '''.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-amber-100,'''.replace('\\n', '\n'),
    '''.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-amber-50,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-amber-100,'''.replace('\\n', '\n'),
    1,
)
css = css.replace(
    '''.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-rose-100,'''.replace('\\n', '\n'),
    '''.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-rose-50,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-rose-100,'''.replace('\\n', '\n'),
    1,
)
css = css.replace(
    '''.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-violet-100,'''.replace('\\n', '\n'),
    '''.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-violet-50,\n.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-violet-100,'''.replace('\\n', '\n'),
    1,
)
write(css_path, css)

# Strengthen the generated contract so "all tools" cannot silently regress to
# only /control-plane and the pre-existing /control-panel preference stays in sync.
test_path = "tests/contracts/control-plane-tools-theme.contract.test.mjs"
write(test_path, r'''import assert from "node:assert/strict";
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
''')

print("Shared theme expanded across all internal StayHub tools without duplicate Control Panel shell")
