---
paths:
  - "src/app/**"
  - "src/components/**"
---

# UI rules

- Use the `build-screen` skill and `docs/UX_PRINCIPLES.md`.
- Five nav items only: Today, Leases, Tenants, Billing, Reports. Settings is behind the profile icon.
- One primary button per screen. Copy from the glossary. Amounts through `formatINR`, dates through `formatDate`.
- Must work at 375px and 1280px wide.
- Role checks happen in server actions, never only in the UI.
