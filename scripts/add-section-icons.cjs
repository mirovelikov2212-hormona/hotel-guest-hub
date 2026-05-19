#!/usr/bin/env node
/**
 * StayHub Section Icons Patch
 * Adds safe fallback icons to section headers in components/GuestHub.tsx
 * without overwriting the whole file.
 */
const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "components", "GuestHub.tsx");

if (!fs.existsSync(filePath)) {
  console.error("❌ Cannot find components/GuestHub.tsx. Run this from the project root.");
  process.exit(1);
}

let src = fs.readFileSync(filePath, "utf8");
const original = src;

const marker = "STAYHUB_SECTION_ICON_HELPERS";

const helper = `

// ${marker}
const SECTION_ICON_PREFIXES: Record<string, string> = {
  info: "ℹ️",
  information: "ℹ️",
  hotel_info: "ℹ️",
  animation: "🎭",
  activities: "🎭",
  ai: "🤖",
  concierge: "🤖",
  ai_concierge: "🤖",
  reception: "🏨",
  housekeeping: "🧺",
  maintenance: "🛠️",
  emergency: "🚨",
  outlets: "🍽️",
  facilities: "🏨",
  venues: "🏨",
  wifi: "📶",
  reviews: "⭐",
  explore: "🗺️",
  nearby: "🗺️",
};

function withSectionIcon(title: string, sectionKey?: string): string {
  const raw = String(title || "").trim();
  if (!raw) return raw;

  // Already starts with emoji/symbol icon.
  if (/^[\\p{Extended_Pictographic}⭐ℹ️⚠️☎️🏨🧺🛠️🎭🤖📶🍽️🗺️🚨]/u.test(raw)) {
    return raw;
  }

  const key = String(sectionKey || "").toLowerCase().trim();
  const text = raw.toLowerCase();

  const icon =
    SECTION_ICON_PREFIXES[key] ||
    (text.includes("инфо") ||
    text.includes("info") ||
    text.includes("information") ||
    text.includes("informace")
      ? "ℹ️"
      : text.includes("анима") ||
        text.includes("animation") ||
        text.includes("animație") ||
        text.includes("animace") ||
        text.includes("animationen")
      ? "🎭"
      : "");

  return icon ? \`\${icon} \${raw}\` : raw;
}
// END_${marker}
`;

// Insert helper after "use client" or after imports.
if (!src.includes(marker)) {
  if (src.includes('"use client";')) {
    src = src.replace('"use client";', `"use client";${helper}`);
  } else if (src.includes("'use client';")) {
    src = src.replace("'use client';", `'use client';${helper}`);
  } else {
    // Fallback: insert after last import block.
    const importMatches = [...src.matchAll(/^import .*?;$/gm)];
    if (importMatches.length) {
      const last = importMatches[importMatches.length - 1];
      const insertAt = (last.index || 0) + last[0].length;
      src = src.slice(0, insertAt) + helper + src.slice(insertAt);
    } else {
      src = helper + src;
    }
  }
}

// Make the common section.title render path icon-aware.
// Uses (section as any) so it does not depend on the exact section type.
src = src.replace(
  /\{section\.title\}/g,
  `{withSectionIcon(section.title, (section as any).id || (section as any).key || (section as any).type || (section as any).section)}`
);

// Also fix common literal fallbacks if present in current GuestHub.tsx.
// These replacements are conservative and idempotent.
const literalReplacements = [
  ['"Инфо"', '"ℹ️ Инфо"'],
  ["'Инфо'", "'ℹ️ Инфо'"],
  ['"Info"', '"ℹ️ Info"'],
  ["'Info'", "'ℹ️ Info'"],
  ['"Information"', '"ℹ️ Information"'],
  ["'Information'", "'ℹ️ Information'"],
  ['"Анимация"', '"🎭 Анимация"'],
  ["'Анимация'", "'🎭 Анимация'"],
  ['"Animation"', '"🎭 Animation"'],
  ["'Animation'", "'🎭 Animation'"],
  ['"Animație"', '"🎭 Animație"'],
  ["'Animație'", "'🎭 Animație'"],
  ['"Animace"', '"🎭 Animace"'],
  ["'Animace'", "'🎭 Animace'"],
];

for (const [from, to] of literalReplacements) {
  // Avoid double-prefixing if the target is already present nearby.
  src = src.split(from).join(to);
}

// Clean accidental double prefixes from repeated runs.
src = src
  .replace(/ℹ️ ℹ️ /g, "ℹ️ ")
  .replace(/🎭 🎭 /g, "🎭 ")
  .replace(/🤖 🤖 /g, "🤖 ");

if (src === original) {
  console.log("ℹ️ No changes made. The file may already be patched, or the header render pattern is different.");
  process.exit(0);
}

const backupPath = filePath + ".bak-section-icons";
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, original, "utf8");
}

fs.writeFileSync(filePath, src, "utf8");
console.log("✅ Section icons patch applied to components/GuestHub.tsx");
console.log("Backup:", backupPath);
console.log("Next: npm run build");
