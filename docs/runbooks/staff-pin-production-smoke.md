# Staff PIN production smoke gate

This release gate is mandatory before promoting changes that affect Staff Hub
authentication, sessions, staff routing, or staff security. Run it for every production hotel and for all four roles:

- Reception
- Manager
- Housekeeping
- Maintenance

Never place a PIN in Git, screenshots, build output, logs, test fixtures,
release notes, issue comments, or chat. Read each PIN only from the approved
secret store and enter it directly in the browser.

## Blocking rule

Any failed check blocks production promotion, database activation, and runtime
cutover. A valid session on one device does not prove that fresh login works on
another device.

## Smoke checks

For each production hotel and role:

1. Confirm that an already authenticated primary staff device still opens the
   exact scoped Staff Hub.
2. Open a fresh private/incognito browser session at the exact hotel and role
   PIN page.
3. Enter the current PIN from the approved secret store. Confirm that login
   returns to `/staff/{hotelSlug}/{role}` and never to `/staff/demo` or another
   hotel/role.
4. Refresh the scoped Staff Hub and confirm the session remains valid.
5. Sign out, confirm the exact scoped PIN page appears, then sign in again and
   confirm the `next` return path is preserved.
6. On one controlled attempt, enter a wrong PIN and confirm the UI shows a
   stable `Invalid PIN` message, never `undefined`, an empty alert, or a false
   success. Then enter the correct PIN and confirm normal recovery.
7. If the API returns a lockout or temporary infrastructure response, confirm
   the UI distinguishes it from an invalid PIN and displays a safe retry
   message. Do not deliberately trigger the six-attempt production lockout.

## Evidence without secrets

Record only:

- hotel slug;
- role;
- UTC timestamp;
- browser/device class;
- pass/fail for existing session, fresh login, scoped redirect, refresh,
  logout/re-login, and error-message recovery;
- public response code when relevant.

Do not record the submitted PIN, PIN hash, raw session token, cookie value,
source key, or authorization headers.

## M10.2 boundary

M10.2 may project and verify normalized configuration, but it must keep
`runtimeReadsActivated=false`. The Staff PIN smoke gate does not authorize a
runtime cutover or a production Supabase migration by itself.
