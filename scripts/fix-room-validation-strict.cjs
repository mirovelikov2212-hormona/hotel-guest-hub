const fs = require('fs');
const path = require('path');

const root = process.cwd();
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, content) { fs.writeFileSync(path.join(root, rel), content, 'utf8'); }
function backup(rel) {
  const p = path.join(root, rel);
  const b = p + '.bak-room-validation-strict';
  if (!fs.existsSync(b)) fs.copyFileSync(p, b);
}
function replaceOrThrow(content, search, replacement, label) {
  if (!content.includes(search)) throw new Error(`Could not find block: ${label}`);
  return content.replace(search, replacement);
}

// 1) lib/config.ts: read Rooms CSV URL from both machine and human-readable CONFIG keys and expose strict flag
{
  const rel = 'lib/config.ts';
  backup(rel);
  let s = read(rel);

  const oldBlock = `  const roomsCsvUrl = pick(\n    mergedConfig,\n    "roomsCsvUrl",\n    process.env.GOOGLE_ROOMS_CSV ?? process.env.GOOGLE_HOTEL_ROOMS_CSV ?? ""\n  );`;
  const newBlock = `  const roomsCsvUrl = [\n    pick(mergedConfig, "roomsCsvUrl", ""),\n    pick(mergedConfig, "Rooms CSV URL", ""),\n    pick(mergedConfig, "Room CSV URL", ""),\n    pick(mergedConfig, "Hotel Rooms CSV URL", ""),\n    process.env.GOOGLE_ROOMS_CSV ?? "",\n    process.env.GOOGLE_HOTEL_ROOMS_CSV ?? "",\n  ].map((item) => String(item || "").trim()).find(Boolean) || "";\n\n  const roomValidationEnabled =\n    Boolean(roomsCsvUrl) ||\n    pickBoolean(mergedConfig, "roomValidationEnabled", false) ||\n    pickBoolean(mergedConfig, "Room Validation Enabled", false);`;

  if (s.includes(oldBlock)) {
    s = s.replace(oldBlock, newBlock);
  } else if (!s.includes('const roomValidationEnabled =')) {
    throw new Error('Could not find roomsCsvUrl block in lib/config.ts. Apply manually.');
  }

  if (!s.includes('roomValidationEnabled,')) {
    s = replaceOrThrow(
      s,
      `    validRoomNumbers,\n  };`,
      `    validRoomNumbers,\n    roomValidationEnabled,\n  };`,
      'validRoomNumbers in cfg object'
    );
  }

  write(rel, s);
}

// 2) lib/types.ts: expose roomValidationEnabled / roomsCsvUrl on HotelConfig if missing
{
  const rel = 'lib/types.ts';
  backup(rel);
  let s = read(rel);

  if (!s.includes('roomValidationEnabled?: boolean')) {
    s = replaceOrThrow(
      s,
      `  /** Convenience list for fast validation in GuestHub and API routes. */\n  validRoomNumbers?: string[];`,
      `  /** Convenience list for fast validation in GuestHub and API routes. */\n  validRoomNumbers?: string[];\n  /** CSV source for the ROOMS tab. If present, room validation is strict. */\n  roomsCsvUrl?: string;\n  /** When true, invalid/unknown rooms are rejected instead of falling back. */\n  roomValidationEnabled?: boolean;`,
      'validRoomNumbers type block'
    );
  }

  write(rel, s);
}

// 3) components/GuestHub.tsx: do not fallback-open room validation when roomsCsvUrl exists but no rooms loaded
{
  const rel = 'components/GuestHub.tsx';
  backup(rel);
  let s = read(rel);

  if (!s.includes('const roomValidationEnabled = Boolean((config as any).roomValidationEnabled')) {
    s = replaceOrThrow(
      s,
      `  const validRoomSet = useMemo(() => new Set(validRoomNumbers), [validRoomNumbers]);\n  const hasStrictRoomList = validRoomSet.size > 0;`,
      `  const validRoomSet = useMemo(() => new Set(validRoomNumbers), [validRoomNumbers]);\n  const hasStrictRoomList = validRoomSet.size > 0;\n  const roomValidationEnabled = Boolean(\n    (config as any).roomValidationEnabled ||\n      (config as any).roomsCsvUrl ||\n      hasStrictRoomList\n  );`,
      'validRoomSet / hasStrictRoomList block'
    );
  }

  s = s.replace(
    `      if (!hasStrictRoomList) return true;\n      return validRoomSet.has(normalized);`,
    `      if (!hasStrictRoomList) return !roomValidationEnabled;\n      return validRoomSet.has(normalized);`
  );

  s = s.replace(
    `    [hasStrictRoomList, validRoomSet]`,
    `    [hasStrictRoomList, roomValidationEnabled, validRoomSet]`
  );

  write(rel, s);
}

// 4) app/api/guest/request-create/route.ts: server-side strict room validation too
{
  const rel = 'app/api/guest/request-create/route.ts';
  backup(rel);
  let s = read(rel);

  const oldCondition = `    if (validRoomNumbers.length > 0 && !validRoomNumbers.includes(room)) {`;
  const newCondition = `    const roomValidationEnabled = Boolean(\n      (hotelConfig as any)?.roomValidationEnabled ||\n        (hotelConfig as any)?.roomsCsvUrl ||\n        validRoomNumbers.length > 0\n    );\n\n    if (roomValidationEnabled && (validRoomNumbers.length === 0 || !validRoomNumbers.includes(room))) {`;

  if (s.includes(oldCondition)) {
    s = s.replace(oldCondition, newCondition);
  } else if (!s.includes('const roomValidationEnabled = Boolean(')) {
    throw new Error('Could not find backend room validation condition. Apply manually.');
  }

  write(rel, s);
}

console.log('✅ Strict room validation patch applied. Run: npm run build');
