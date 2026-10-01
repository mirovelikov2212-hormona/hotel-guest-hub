# GOSTAYA Project Guardrails

These rules apply to all development, testing, debugging, and launch work for GOSTAYA.

## Tooling and access

- Do not use TinyFish or any comparable third-party browser, crawling, or web-automation intermediary for GOSTAYA project work.
- Use only the project's direct first-party/connected infrastructure tools for GitHub, Vercel, Supabase, and other explicitly approved services.
- If a required check cannot be completed through the approved direct tools, stop at that boundary and provide the exact manual verification steps for the owner to perform.
- Never request passwords, secret keys, service-role keys, or other credentials in chat.

## Release safety

- Work preview-first.
- Do not merge PR #185 or modify main/Production unless explicitly approved by the owner.
- Do not bypass validation with hotel-specific hacks or hidden fallbacks.
- Keep multi-hotel and tenant-isolation behavior generic for 100+ hotels.
- Manual device/UI verification by the owner is authoritative when direct automated access is unavailable.
