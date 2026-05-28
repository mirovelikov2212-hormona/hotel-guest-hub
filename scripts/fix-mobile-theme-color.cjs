const fs = require('fs');
const path = require('path');

const BRAND_THEME = '#F5F5F5';
const repo = process.cwd();
const manifestPath = path.join(repo, 'app', 'manifest.ts');
const layoutPath = path.join(repo, 'app', 'layout.tsx');

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  return fs.readFileSync(file, 'utf8');
}
function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${path.relative(repo, file)}`);
}
function backup(file) {
  const bak = `${file}.bak-mobile-theme`;
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
}

// 1) Manifest controls installed PWA / mobile browser theme color
let manifest = read(manifestPath);
backup(manifestPath);
manifest = manifest.replace(/background_color:\s*["'][^"']+["']/g, `background_color: "${BRAND_THEME}"`);
manifest = manifest.replace(/theme_color:\s*["'][^"']+["']/g, `theme_color: "${BRAND_THEME}"`);
write(manifestPath, manifest);

// 2) Viewport themeColor controls Chrome/Android status bar on normal browser load
let layout = read(layoutPath);
backup(layoutPath);

if (!/import\s+type\s+\{[^}]*Viewport[^}]*\}\s+from\s+["']next["']/.test(layout)) {
  layout = layout.replace(/import\s+type\s+\{\s*Metadata\s*\}\s+from\s+["']next["'];/, 'import type { Metadata, Viewport } from "next";');
}

if (!/export\s+const\s+viewport\s*:/m.test(layout) && !/export\s+const\s+viewport\s*=/m.test(layout)) {
  const viewportBlock = `\nexport const viewport: Viewport = {\n  themeColor: "${BRAND_THEME}",\n  colorScheme: "light",\n};\n`;
  // Insert after metadata block if possible, otherwise after imports
  const metadataMatch = layout.match(/export\s+const\s+metadata\s*:\s*Metadata\s*=\s*\{[\s\S]*?\n\};/);
  if (metadataMatch) {
    layout = layout.replace(metadataMatch[0], `${metadataMatch[0]}\n${viewportBlock}`);
  } else {
    layout = layout.replace(/import[^;]+;\s*/s, (m) => `${m}${viewportBlock}\n`);
  }
} else {
  // Replace existing themeColor/colorScheme values if viewport already exists
  layout = layout.replace(/themeColor:\s*["'][^"']+["']/g, `themeColor: "${BRAND_THEME}"`);
  layout = layout.replace(/colorScheme:\s*["'][^"']+["']/g, `colorScheme: "light"`);
}

write(layoutPath, layout);

console.log('\nDone. Mobile theme/status bar color is now #F5F5F5.');
console.log('Run: npm run build');
