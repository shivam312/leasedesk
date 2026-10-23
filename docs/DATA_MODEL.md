# Data model

Every table has `id` (uuid), `organization_id` (uuid, except `organizations`), `created_at`, `updated_at`, and row-level security restricting rows to members of the organization. Money columns are `bigint` paise, percentages are `integer` basis points, areas are `integer` hundredths of a sq ft, dates are `date`. Statuses are Postgres enums.

**Status (M2, in progress):** built so far: `organizations`, `memberships`, `billing_entities` (`src/lib/db/schema/organizations.ts`); `buildings`, `floors`, `units` (`property.ts`); `tenants`, `tenant_contacts` (`tenants.ts`); `activity_log` (`activity-log.ts`, append-only: no update or delete policy, and a trigger refuses both for every role; write it through `src/lib/db/activity-log.ts`). Child tables reference their parent together with `organization_id` (composite foreign keys), so a row can never point at another organization's row. Row-level security policies are hand-written in `drizzle/0003_rls_policies.sql`: members read their organization's rows, writes depend on role, only owners delete. A new table calls `app.apply_org_policies(...)` in a custom migration; `rls.db.test.ts` fails if any public table has no policy. Database tests are `*.db.test.ts` and run against the local stack inside a rolled-back transaction (`src/lib/db/__tests__/harness.ts`). Schema files go in `src/lib/db/schema/` (one file per table group below, re-exported from `index.ts`), migrations in `drizzle/` (D12). Drizzle uses `casing: "snake_case"`, so TypeScript names are camelCase and columns are the snake_case names written here.

**Settings columns:** `organizations`, `billing_entities`, `buildings`, `tenants` and `leases` each have `settings` (jsonb, default `{}`). Keys and defaults are in `docs/SETTINGS.md`; only values that differ from the default are stored. They're validated by `src/lib/settings/schema.ts` and read only through `src/lib/settings/resolve.ts` (lease → tenant → building → organization → default; billing-entity keys apply to that entity's invoice series).

## Organization and people

**organizations**: name, legal_name, pan, logo_path, settings (jsonb).

**memberships**: user_id (Supabase auth user; null until an invited person accepts), email (lower-case; unique per organization, as is user_id), role (`owner`, `accounts`, `property_manager`, `viewer`), invited_by, status (`invited`, `active`, `removed`), invite_token_hash (SHA-256 of the invite link's token while the invite is open; unique; cleared on accept).

**billing_entities**: the GSTIN an invoice is issued from. legal_name, gstin, state_code, address, bank_account_name, bank_account_number, ifsc, upi_id, settings (jsonb).

## Property

**buildings**: name, address, city, state_code, billing_entity_id, invoice_prefix, credit_note_prefix, settings (jsonb). The building defaults for GST rate, SAC code, due days and charge timing are setting overrides in `settings`, not columns (D13).

**floors**: building_id, label, sort_order. Optional; small buildings can skip floors.

**units**: building_id, floor_id (nullable), code (unique per building), carpet_area (hundredths sq ft), chargeable_area (hundredths sq ft), status (`vacant`, `leased`, `fit_out`, `blocked`).

## Tenants and leases

**tenants**: company_name, gstin (nullable), pan, billing_address, state_code, TDS per charge type (`docs/BILLING_RULES.md` section 10): deducts_tds_rent, tds_rate_bp_rent, deducts_tds_cam, tds_rate_bp_cam, deducts_tds_parking, tds_rate_bp_parking, deducts_tds_other, tds_rate_bp_other (utilities, signage, other); TDS columns default to on at 1000 bp, as for a company, settings (jsonb), notes.

**tenant_contacts**: tenant_id, name, role (`billing`, `admin`, `legal`, `other`), email, phone, whatsapp (bool), is_primary (at most one per tenant).

**leases**: tenant_id, building_id, status (`draft`, `active`, `in_notice`, `expired`, `terminated`), start_date, end_date, lock_in_end_date, notice_period_months, rent_free_months, rent_free_days, rent_commencement_date (derived, stored), area_basis (`carpet`, `chargeable`), deposit_amount, version (int), replaces_lease_id (for renewals and amendments), signed_document_id, settings (jsonb).

**lease_units**: lease_id, unit_id, area (hundredths sq ft, copied at signing so later unit edits don't change billing).

**lease_charges**: lease_id, type, basis, rate_or_amount, quantity (slots), start_date, end_date, frequency, timing, gst_rate_bp, sac_code, waived_during_rent_free, label.

**escalation_rules**: lease_id, applies_to (array of charge ids, or `rent`), percent_bp, every_months, anchor (`lease_start`, `rent_commencement`, `custom`), anchor_date, compounding.

**custom_escalations**: lease_id, charge_id, effective_date, new_amount (nullable), percent_bp (nullable).

**critical_dates**: lease_id, type (`expiry`, `lock_in_end`, `escalation`, `renewal_option`, `notice_deadline`, `custom`), date, remind_days (int array, e.g. {180, 90, 30}), assigned_to (user), status (`open`, `done`, `snoozed`), snoozed_until.

## Billing

**invoice_series**: billing_entity_id, kind (`invoice`, `credit_note`), financial_year, prefix, next_number. Row-locked when assigning numbers.

**invoices**: tenant_id, lease_id, building_id, billing_entity_id, number (null while draft), invoice_date, due_date, period_start, period_end, status (`draft`, `sent`, `part_paid`, `paid`, `overdue`, `cancelled`), taxable_total, cgst_total, sgst_total, igst_total, round_off, grand_total, expected_tds, pdf_path, sent_at, sent_to (text array).

**invoice_lines**: invoice_id, charge_id, description, period_start, period_end, quantity_label (e.g. "1,250.50 sq ft × ₹85.50"), taxable_amount, gst_rate_bp, cgst, sgst, igst, explanation (jsonb: how the amount was calculated, shown when the user taps it).

**credit_notes**: invoice_id, number, date, reason, note, taxable_amount, cgst, sgst, igst, total.

**payments**: tenant_id, received_date, amount_received, tds_deducted, mode (`neft`, `rtgs`, `imps`, `upi`, `cheque`, `cash`, `other`), reference, bank_statement_line_id (nullable), status (`active`, `reversed`), reversed_by_payment_id.

**payment_allocations**: payment_id, invoice_id, amount_settled (includes the TDS share).

**tds_records**: tenant_id, payment_id, invoice_id, amount, financial_year, quarter (1–4), certificate_received, certificate_document_id.

**security_deposit_entries**: lease_id, date, type (`received`, `adjusted`, `refunded`, `top_up`), amount, note.

## Bank matching and exports

**bank_accounts**: billing_entity_id, bank_name, account_last4, column_mapping (jsonb, saved after the first import).

**bank_statement_imports**: bank_account_id, file_path, period_start, period_end, imported_by.

**bank_statement_lines**: import_id, date, description, reference, credit_amount, debit_amount, match_status (`unmatched`, `suggested`, `matched`, `ignored`), suggested_tenant_id, suggested_invoice_ids, confidence (0–100).

**exports**: kind (`tally_xml`, `excel`, `pdf`), parameters (jsonb), file_path, created_by.

## Supporting

**documents**: owner_type (`lease`, `tenant`, `unit`, `building`), owner_id, kind (`agreement`, `addendum`, `tds_certificate`, `id_proof`, `insurance`, `other`), file_path, file_name, uploaded_by.

**reminders**: invoice_id, channel (`email`, `whatsapp_link`), sent_at, sent_by (null if automatic), status.

**activity_log**: actor_user_id (null for background jobs), entity_type, entity_id, action (`create`, `update`, `delete`, `send`, `reverse`, …), before (jsonb), after (jsonb), at. Never updated or deleted.

## Invariants (check in tests)

- A sent invoice's amounts and lines never change.
- Sum of allocations for a payment ≤ amount_received + tds_deducted.
- An invoice's `paid` status ⇔ allocations + credit notes ≥ grand_total (within round-off).
- Invoice numbers within a series and financial year are unique and gap-free.
- A unit can't be in two active leases with overlapping dates.
