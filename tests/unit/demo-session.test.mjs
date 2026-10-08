import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDemoSession, demoStorageKey } from '../../lib/demo-session.ts';

test('only a complete random UUID can identify a demo session', () => {
  assert.equal(normalizeDemoSession('not-a-session'), null);
  assert.equal(normalizeDemoSession('00000000-0000-0000-0000-000000000000'), null);
  assert.equal(normalizeDemoSession('f925b740-2c82-4c70-bb34-7a3d4721f5a2'), 'f925b740-2c82-4c70-bb34-7a3d4721f5a2');
});
test('fresh demo sessions cannot restore each other’s room, requests or guide state', () => {
  const previous = globalThis.window;
  try {
    globalThis.window = {location:{pathname:'/h/demo',search:'?demoSession=f925b740-2c82-4c70-bb34-7a3d4721f5a2'}};
    const first = demoStorageKey('guesthub_guest_request_refs');
    window.location.search='?demoSession=44cfbe47-0935-4d31-9fbb-c774b39024a1';
    assert.notEqual(demoStorageKey('guesthub_guest_request_refs'), first);
    window.location.pathname='/h/aquamarine';
    assert.equal(demoStorageKey('guesthub_guest_request_refs'), 'guesthub_guest_request_refs');
  } finally { globalThis.window = previous; }
});
