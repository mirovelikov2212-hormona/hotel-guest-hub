import test from "node:test";

// These TODO contracts intentionally document confirmed Patch 0 gaps without
// changing production behavior in Patch 1. Each TODO must be converted into a
// passing enforcement test in the isolated patch that fixes the corresponding risk.

test.todo("massage POST requires validated stayId and stayDeviceId before a real booking write");
test.todo("massage active_bookings requires validated stay/device identity");
test.todo("guest request status GET requires validated stay/device identity");
test.todo("guest request room validation fails closed when the room configuration cannot be loaded");
test.todo("guest request department, billing, price, currency and notifications are derived server-side");
test.todo("pillow_menu is a first-class canonical staff request type");
test.todo("staff login has persistent throttling and temporary lockout protection");
