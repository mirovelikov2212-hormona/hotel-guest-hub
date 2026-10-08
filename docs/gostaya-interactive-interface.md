# GOSTAYA interactive interface

## Responsibilities

- `components/marketing/ProductModuleExplorer.tsx`: illustrative public feature previews in Bulgarian, English and German. Selecting a feature changes the preview only; no hotel request or message is sent.
- `components/staff/manager/ManagerExperience.tsx`: optional door/bell introduction, audio and the nine-module lobby. It contains no request, billing or integration business logic.
- `components/staff/manager/ManagerModuleDialog.tsx`: native HTML dialog for module navigation, keyboard focus and closing.
- `components/staff/manager/manager-module-copy.ts`: stable module IDs, labels and descriptions.
- `components/staff/pages/ManagerPageContent.tsx`: composes the existing staff components, request actions, surveys and reports inside the new lobby.

## Data and permissions

Operational data continues to come from the existing Staff Store and staff APIs. Route authentication and paid-module checks remain in their existing routes. Cards for paid modules lead to those protected routes. The room card represents Guest Hub activity, not PMS occupancy. Integration status comes from the existing integration component.

The guided request demo keeps its compact department panels. `/demo?lang=bg&managerExperience=1` opens the same isolated demo workspace with the new manager lobby. Demo session setup is still owned by `DemoWorkspace`.

## Motion and assets

Animations use CSS and one cancellable timeout per intro transition. Reduced-motion preferences are respected. Audio is loaded when the user clicks and may be muted. The intro is remembered for the current browser tab and hotel; replay is always available.

User-provided assets live in `public/marketing/manager/`. Preserve the visible sound attribution to Gravity Sound (CC BY 4.0) and picturetosound.com.

The supplied gold bell image is used only for browser favicons (`app/favicon.ico` and the 32px `app/icon.png`). PWA and Apple home-screen icons retain their previous assets.

## Restore the previous version

Stable commit: `d49ed6acfc6ee7424a9077aef5dfbad9cf84f818`.

GitHub backup branch: `backup/gostaya-before-interactive-manager-2026-10-09`.

Local tag: `gostaya-before-interactive-manager-2026-10-09`.

Deploy the backup branch to Preview to compare or restore the prior website. Production is outside this change.
