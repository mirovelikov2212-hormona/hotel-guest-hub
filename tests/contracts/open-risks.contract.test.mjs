import test from "node:test";

// These TODO contracts intentionally document confirmed Patch 0 gaps without
// changing production behavior in Patch 1. Each TODO must be converted into a
// passing enforcement test in the isolated patch that fixes the corresponding risk.

test.todo("staff login has persistent throttling and temporary lockout protection");
