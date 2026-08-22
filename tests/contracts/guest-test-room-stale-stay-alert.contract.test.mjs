import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("components/GuestHub.tsx", "utf8");

test("configured test rooms silently recover stale guest stay identity without weakening real-room expiry alerts", () => {
  assert.match(source, /const testRoomSet = useMemo\([\s\S]*config\.testRoomNumbers/);
  assert.match(source, /const isDateExemptTestRoom = useCallback\([\s\S]*testRoomSet\.has\(normalizeRoomNumber\(candidate\)\)/);
  assert.match(source, /const staleRoom = normalizeRoomNumber\(room \|\| manualRoomInput \|\| qrRoom\);[\s\S]*if \(!isDateExemptTestRoom\(staleRoom\) && !stayExpiredNotifiedRef\.current\) \{[\s\S]*window\.alert\(stayCopy\.expired\)/);
  assert.match(source, /const expiredRoom = normalizeRoomNumber\(room \|\| manualRoomInput \|\| qrRoom\);[\s\S]*if \(!isDateExemptTestRoom\(expiredRoom\) && !stayExpiredNotifiedRef\.current\) \{[\s\S]*window\.alert\(stayCopy\.expired\)/);
  assert.match(source, /roomStateHydrated,\n\s+isDateExemptTestRoom,\n\s+roomStateKey,/);
  assert.doesNotMatch(source, /isDateExemptTestRoom\([^)]*["']103["']/);
});
