# M12 — Staff Sound & Notification Parity

## Status

Pre-release validation is green on `audit/m12-staff-notification-parity`. Production release evidence is added only after a controlled merge to `main` and automatic Vercel deployment.

## Goal

Give Reception, Housekeeping, Maintenance and Manager the same notification behavior without changing operational routing, hotel configuration, Production data, or M11 sandbox isolation.

## Staff notification matrix

| Staff role | In-tab sound toggle | Background tab blink | Web push controls | Sandbox live push |
| --- | --- | --- | --- | --- |
| Reception | Yes | Yes | Yes | Suppressed |
| Housekeeping | Yes | Yes | Yes | Suppressed |
| Maintenance | Yes | Yes | Yes | Suppressed |
| Manager | Yes | Yes | Yes | Suppressed |

All four roles use the shared `useStaffAlertSound` and `useStaffTabTitleAlert` behavior. Reception no longer maintains a separate blinking-title implementation.

## Sound behavior

- The sound preference remains scoped by hotel and staff role in browser local storage.
- Existing requests loaded during the initial hydration baseline do not generate a new-request sound.
- Test requests do not generate a live alert.
- Request IDs remain remembered for the current page lifetime, so a transient polling disappearance/reappearance does not generate a second alert.
- HTML audio remains the primary chime path.
- `AudioContext` / `webkitAudioContext` is resumed after an allowed user interaction and provides a fallback tone if media playback is blocked.
- Browser autoplay policy is treated as a platform limitation, not as a request-processing failure.

## Background tab behavior

- A newly observed real request blinks the browser title only while the tab is hidden or unfocused.
- Focusing the tab stops blinking and restores the original title.
- Existing requests at initial hydration do not start a phantom blink.
- Test requests are excluded.

## Push behavior and deduplication

- A physical push endpoint can have only one active staff role per hotel after registration.
- Registering the same device endpoint for another role disables the previous active role for that same hotel/endpoint before enabling the current role.
- The legacy Manager subscription route follows the same same-origin and endpoint-role rules.
- Delivery is deduplicated by hotel + request + physical endpoint for a short server-process window, so the Manager notification and routed department notification cannot intentionally send the same request twice to the same endpoint in the same process.
- Browser notification tag is request-scoped and uses `renotify: false`, allowing the browser/service worker to collapse duplicate delivery for the same request.
- Expired push subscriptions continue to be disabled after 404/410 delivery responses.

## Browser / OS limits

### iOS / iPadOS

Web push requires a supported iOS/iPadOS version, an installed Home Screen web app, notification permission, and normal OS notification availability. A normal Safari tab is not equivalent to an installed web app for push. Sound inside an open page can still require an explicit user gesture because of browser autoplay rules.

### Android / Chromium browsers

Push and background notifications work only where Service Worker, PushManager and Notification APIs are supported and the user grants permission. In-tab audio can also be subject to autoplay and device mute/volume policy.

### General

StayHub cannot override OS-level mute, Focus/Do Not Disturb, notification permission, browser-level notification blocking, or vendor power-saving restrictions.

## Sandbox and tenant safety

M12 preserves the M11 boundary:

- sandbox and test-room request creation suppresses live staff/manager push;
- M12 does not add a sandbox exception to live push delivery;
- push subscription reads/writes remain hotel scoped;
- no M12 Supabase schema migration is required;
- no Google Sheet write behavior is changed.

Pre-release live database check found no Production endpoint with more than one enabled staff role, so no Production subscription cleanup was required.

## Pre-release gates

- Contract suite: `137/137` passed.
- Tenant isolation guard: passed; `137` Supabase queries inventoried and `45` existing `needs_review` findings remained explicitly reviewed.
- Scoped ESLint for M12 changed sources: passed.
- Exact functional branch Preview commit: `47ecca5ef9f1be54cf011c8055c067b9f1f0a582`.
- Exact Preview deployment: `dpl_HD75vb33CDKQzmariE34KZfCYGoQ` — `READY`.
- Next.js 16.1.6 build: compile, TypeScript, page generation and Vercel deployment completed successfully.
- Preview `error` / `warning` / `fatal` runtime logs: none found.
- Preview UI HTTP smoke is limited by Vercel Authentication; no Production bypass or write was used to work around that protection.

## Rollback

M12 has no database migration and no required data transformation. Rollback is therefore code-only:

1. restore the previous known-good Production code checkpoint `bbc229e82e6b395657529e3abd05a358710efe5f` through the normal Git/Vercel rollback process;
2. do not modify staff push subscription rows unless a separate data incident is proven;
3. verify the four Staff PIN surfaces and Production guest route after rollback.

## Production release evidence

Pending controlled M12 PR merge. This section must record the PR, merge commit, automatic Production deployment, smoke results and final rollback checkpoint before M12 is marked CLOSED / COMPLETE.
