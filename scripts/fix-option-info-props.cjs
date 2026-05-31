const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'GuestHub.tsx');
if (!fs.existsSync(file)) {
  console.error('Cannot find components/GuestHub.tsx. Run this script from the project root.');
  process.exit(1);
}

let s = fs.readFileSync(file, 'utf8');
const before = s;

function addAfterOncePerBlock(text, after, addition) {
  // Add addition after every exact occurrence of after, but only when the next nearby lines do not already contain it.
  let out = '';
  let i = 0;
  while (true) {
    const idx = text.indexOf(after, i);
    if (idx === -1) {
      out += text.slice(i);
      break;
    }
    const end = idx + after.length;
    out += text.slice(i, end);
    const lookahead = text.slice(end, end + 180);
    if (!lookahead.includes(addition.trim())) {
      out += addition;
    }
    i = end;
  }
  return out;
}

s = addAfterOncePerBlock(
  s,
  '                getRequestDefOptionImages={getRequestDefOptionImages}',
  '\n                getRequestDefOptionInfo={getRequestDefOptionInfo}'
);

s = addAfterOncePerBlock(
  s,
  '  getRequestDefOptionImages,',
  '\n  getRequestDefOptionInfo,'
);

s = addAfterOncePerBlock(
  s,
  '  getRequestDefOptionImages: (def?: RequestDef | null) => string[];',
  '\n  getRequestDefOptionInfo: (def?: RequestDef | null) => string[];'
);

// Defensive: if an earlier broken patch used a local variable name that conflicts, normalize to the array access pattern.
s = s.replace(/const optionInfos = getRequestDefOptionInfo\(def\);/g, 'const optionInfos = getRequestDefOptionInfo(def);');

if (s === before) {
  console.log('No changes needed. GuestHub.tsx already looks patched.');
} else {
  fs.writeFileSync(file, s, 'utf8');
  console.log('Patched components/GuestHub.tsx: added getRequestDefOptionInfo prop wiring.');
}
