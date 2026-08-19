from pathlib import Path

codemod_path = Path("scripts/shared_guest_runtime_genericize_once.py")
code = codemod_path.read_text()

old_sub = "source, count = re.subn(pattern, replacement, source, count=1, flags=flags)"
new_sub = "source, count = re.subn(pattern, lambda _match: replacement, source, count=1, flags=flags)"
if code.count(old_sub) != 1:
    raise SystemExit("literal-safe sub helper target mismatch")
code = code.replace(old_sub, new_sub, 1)

old_header = r"r'''\1  const guestRuntimeCapabilities = useMemo("
new_header = "'''export default function GuestHub({ config }: { config: HotelConfig }) {\n  const guestRuntimeCapabilities = useMemo("
if code.count(old_header) != 1:
    raise SystemExit("GuestHub header replacement target mismatch")
code = code.replace(old_header, new_header, 1)

marker = "\nlower = source.lower()\n"
if code.count(marker) != 1:
    raise SystemExit("final guard marker mismatch")
cleanup = r'''
replace_once(
    '        <div className={isAquamarineHub ? "stayhub-premium-hero-overlay stayhub-premium-hero-overlay-sandbox absolute inset-0" : "stayhub-premium-hero-overlay absolute inset-0"} />\n',
    '        <div className="stayhub-premium-hero-overlay absolute inset-0" />\n',
    "hero overlay tenant branch",
)
replace_once(
    '            hotelSlug: String(config.hotelSlug || roomStateKey || "aquamarin"),\n',
    '            hotelSlug: String(config.hotelSlug || roomStateKey || ""),\n',
    "stay status tenant fallback",
)
replace_once(
    '          hotelSlug: String(config.hotelSlug || hotelContentSlug || "aquamarin"),\n',
    '          hotelSlug: String(config.hotelSlug || hotelContentSlug || ""),\n',
    "stay confirm tenant fallback",
)
replace_once(
    '  const name = String(hotelName || "Hotel Aquamarine").trim();\n',
    '  const name = String(hotelName || "StayHub").trim();\n',
    "guest intro tenant fallback",
)
'''
code = code.replace(marker, "\n" + cleanup + marker, 1)

exec(compile(code, str(codemod_path), "exec"), {"__name__": "__main__"})
