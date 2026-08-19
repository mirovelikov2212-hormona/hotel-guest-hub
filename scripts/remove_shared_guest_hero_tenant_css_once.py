from pathlib import Path

css_path = Path("app/globals.css")
source = css_path.read_text()

start_marker = "/* sandbox hero clean v4 */\n"
end_marker = "/* STAYHUB_SANDBOX_HERO_CONTROLS_OFFSET_END */\n"

if source.count(start_marker) != 1:
    raise SystemExit(f"hero CSS start marker mismatch: {source.count(start_marker)}")
if source.count(end_marker) != 1:
    raise SystemExit(f"hero CSS end marker mismatch: {source.count(end_marker)}")

start = source.index(start_marker)
end = source.index(end_marker, start) + len(end_marker)
removed = source[start:end]

required = [
    'background-image: url("/images/aquamarine-test-hero-v6.jpg")',
    ".stayhub-premium-hero-sandbox",
    ".stayhub-premium-hero-image-sandbox",
    ".stayhub-premium-hero-overlay-sandbox",
    ".stayhub-premium-hero-wrap-sandbox",
]
for token in required:
    if token not in removed:
        raise SystemExit(f"expected tenant hero CSS token missing: {token}")

source = source[:start] + source[end:]

for forbidden in [
    "/images/aquamarine-test-hero-v6.jpg",
    ".stayhub-premium-hero-sandbox",
    ".stayhub-premium-hero-image-sandbox",
    ".stayhub-premium-hero-overlay-sandbox",
    ".stayhub-premium-hero-wrap-sandbox",
]:
    if forbidden in source:
        raise SystemExit(f"tenant hero CSS leftover: {forbidden}")

css_path.write_text(source)

contract_path = Path("tests/contracts/shared-guest-runtime-genericization.contract.test.mjs")
contract = contract_path.read_text()
anchor = '''test("Explore recommendations are materialized from HOTEL_INFO data", async () => {\n'''
if contract.count(anchor) != 1:
    raise SystemExit(f"contract anchor mismatch: {contract.count(anchor)}")
addition = '''test("shared Guest stylesheet has no tenant-specific hero asset or sandbox framing", async () => {\n  const source = await readProjectFile("app/globals.css");\n  const lower = source.toLowerCase();\n\n  assertNotContains(lower, "/images/aquamarine-test-hero-v6.jpg");\n  assertNotContains(lower, ".stayhub-premium-hero-sandbox");\n  assertNotContains(lower, ".stayhub-premium-hero-image-sandbox");\n  assertNotContains(lower, ".stayhub-premium-hero-overlay-sandbox");\n  assertNotContains(lower, ".stayhub-premium-hero-wrap-sandbox");\n});\n\n'''
contract = contract.replace(anchor, addition + anchor, 1)
contract_path.write_text(contract)
