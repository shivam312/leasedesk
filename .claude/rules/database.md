---
paths:
  - "src/lib/db/**"
  - "drizzle/**"
  - "scripts/seed.ts"
---

# Database rules

- Use the `db-change` skill. Keep `docs/DATA_MODEL.md` in sync.
- Every table has `organization_id` and row-level security.
- Never edit an applied migration. Never run migrations against staging or production without asking.
- Financial records (sent invoices, lines, credit notes, payments, activity log) are never updated or deleted by application code.
