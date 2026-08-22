import fs from "node:fs";

const guestHubPath = "components/GuestHub.tsx";
const contractPath = "tests/contracts/guest-test-room-stale-stay-alert.contract.test.mjs";

let source = fs.readFileSync(guestHubPath, "utf8");

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: target not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: target is not unique`);
  }
  source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

replaceOnce(
  "recoverable stale identity alert",
  `          if (!stayExpiredNotifiedRef.current) {\n            stayExpiredNotifiedRef.current = true;\n            window.alert(stayCopy.expired);\n          }\n          return;`,
  `          if (!isDateExemptTestRoom(staleRoom) && !stayExpiredNotifiedRef.current) {\n            stayExpiredNotifiedRef.current = true;\n            window.alert(stayCopy.expired);\n          }\n          return;`,
);

replaceOnce(
  "inactive stay alert",
  `        setEffectiveCheckOutAt(payload.stay.effectiveCheckOutAt);\n        if (payload.stay.active) return;\n\n        setRoomConfirmed(false);\n        setRoom(\"\");\n        setActiveStayId(\"\");\n        setStayDeviceId(\"\");\n        setEffectiveCheckOutAt(\"\");\n        setManualRoomInput(qrRoom || \"\");\n        if (!stayExpiredNotifiedRef.current) {\n          stayExpiredNotifiedRef.current = true;\n          window.alert(stayCopy.expired);\n        }`,
  `        setEffectiveCheckOutAt(payload.stay.effectiveCheckOutAt);\n        if (payload.stay.active) return;\n\n        const expiredRoom = normalizeRoomNumber(room || manualRoomInput || qrRoom);\n\n        setRoomConfirmed(false);\n        setRoom(\"\");\n        setActiveStayId(\"\");\n        setStayDeviceId(\"\");\n        setEffectiveCheckOutAt(\"\");\n        setManualRoomInput(qrRoom || \"\");\n        if (!isDateExemptTestRoom(expiredRoom) && !stayExpiredNotifiedRef.current) {\n          stayExpiredNotifiedRef.current = true;\n          window.alert(stayCopy.expired);\n        }`,
);

replaceOnce(
  "stay refresh dependency",
  `    roomStateHydrated,\n    roomStateKey,\n    stayCopy.expired,`,
  `    roomStateHydrated,\n    isDateExemptTestRoom,\n    roomStateKey,\n    stayCopy.expired,`,
);

fs.writeFileSync(guestHubPath, source);

const contract = `import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport test from "node:test";\n\nconst source = fs.readFileSync("components/GuestHub.tsx", "utf8");\n\ntest("configured test rooms silently recover stale guest stay identity without weakening real-room expiry alerts", () => {\n  assert.match(source, /const testRoomSet = useMemo\\([\\s\\S]*config\\.testRoomNumbers/);\n  assert.match(source, /const isDateExemptTestRoom = useCallback\\([\\s\\S]*testRoomSet\\.has\\(normalizeRoomNumber\\(candidate\\)\\)/);\n  assert.match(source, /const staleRoom = normalizeRoomNumber\\(room \\|\\| manualRoomInput \\|\\| qrRoom\\);[\\s\\S]*if \\(!isDateExemptTestRoom\\(staleRoom\\) && !stayExpiredNotifiedRef\\.current\\) \\{[\\s\\S]*window\\.alert\\(stayCopy\\.expired\\)/);\n  assert.match(source, /const expiredRoom = normalizeRoomNumber\\(room \\|\\| manualRoomInput \\|\\| qrRoom\\);[\\s\\S]*if \\(!isDateExemptTestRoom\\(expiredRoom\\) && !stayExpiredNotifiedRef\\.current\\) \\{[\\s\\S]*window\\.alert\\(stayCopy\\.expired\\)/);\n  assert.match(source, /roomStateHydrated,\\n\\s+isDateExemptTestRoom,\\n\\s+roomStateKey,/);\n  assert.doesNotMatch(source, /isDateExemptTestRoom\\([^)]*[\"']103[\"']/);\n});\n`;

fs.writeFileSync(contractPath, contract);
console.log("Applied exact config-driven test-room stale stay alert patch.");
