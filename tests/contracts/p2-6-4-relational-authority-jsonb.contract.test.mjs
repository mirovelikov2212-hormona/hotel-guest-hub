import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const migration = await readFile(
  resolve(process.cwd(), "supabase/migrations/20260825092000_p2_6_4_relational_authority_jsonb_fix.sql"),
  "utf8",
);

test("P2.6.4 relational authority removes unsupported jsonb_object_length runtime calls", () => {
  assert.match(migration, /v_old := \$old\$[\s\S]*jsonb_object_length\(v_room_map\)/);
  assert.match(migration, /v_old := \$old\$[\s\S]*jsonb_object_length\(v_department_map\)/);
  assert.match(migration, /v_old := \$old\$[\s\S]*jsonb_object_length\(v_routing_map\)/);
  assert.match(migration, /v_authority := replace\(v_authority,v_old,v_new\)/);
  assert.match(migration, /position\('jsonb_object_length' in v_authority\)>0/);
});

test("P2.6.4 relational authority preserves fail-closed non-empty map semantics", () => {
  assert.match(migration, /coalesce\(v_room_map,'\{\}'::jsonb\)='\{\}'::jsonb/);
  assert.match(migration, /coalesce\(v_department_map,'\{\}'::jsonb\)='\{\}'::jsonb/);
  assert.match(migration, /coalesce\(v_routing_map,'\{\}'::jsonb\)='\{\}'::jsonb/);
  assert.match(migration, /P2_6_4_RELATIONAL_AUTHORITY_EMPTY/);
  assert.match(migration, /P2_6_4_RELATIONAL_AUTHORITY_LIVE_STATE_INVALID/);
  assert.match(migration, /P2_6_4_RELATIONAL_AUTHORITY_RESOURCE_DRIFT/);
  assert.match(migration, /P2_6_4_RELATIONAL_AUTHORITY_ROUTING_DUPLICATE/);
});
