# Data model

Every table has `id` (uuid), `organization_id` (uuid, except `organizations`), `created_at`, `updated_at` (except `activity_log`, which has only `at`), and row-level security restricting rows to members of the organization. Money columns are `bigint` paise, percentages are `integer` basis points, areas are `integer` hundredths of a sq ft, dates are `date`. Statuses are Postgres enums.

**Status (end of M4):** built: `organizations`, `memberships`, `billing_entities` (`src/lib/db/schema/organizations.ts`); `buildings`, `floors`, `units` (`property.ts`); `tenants`, `tenant_contacts` (`tenants.ts`); `activity_log` (`activity-log.ts`, append-only: no update or delete policy, and a trigger refuses both for every role; write it through `src/lib/db/activity-log.ts`). Child tables reference their parent together with `organization_id` (composite foreign keys), so a row can never point at another organization's row. Row-level security policies are hand-written in `drizzle/0003_rls_policies.sql`: members read their organization's rows, writes depend on role, only owners delete. A new table calls `app.apply_org_policies(...)` in a custom migration; `rls.db.test.ts` fails if any public table has no policy. Database tests are `*.db.test.ts` and run against the local stack inside a rolled-back transaction (`src/lib/db/__tests__/harness.ts`). Schema files go in `src/lib/db/schema/` (one file per table group below, re-exported from `index.ts`), migrations in `drizzle/` (D12). Drizzle uses `casing: "snake_case"`, so TypeScript names are camelCase and columns are the snake_case names written here. `leases`, `lease_units`, `lease_charges`, `escalation_rules`, `custom_escalations` and `critical_dates` are in `leases.ts` (M3, migrations `drizzle/0008`–`0011`, applied locally; owners and property managers write, only owners delete). `invoice_series`, `invoices`, `invoice_lines`, `credit_notes` and `credit_note_lines` are in `invoices.ts` (M4, migrations `drizzle/0012`–`0013`, not yet applied locally (Human task); owners and accounts write, drafts can be deleted, and triggers in `0013` refuse any change to a sent invoice, its lines or a credit note apart from the status and filling in the PDF path once). The other billing tables, from `payments` down, arrive in M5 and later.

**Settings columns:** `organizations`, `billing_entities`, `buildings`, `tenants` and `leases` each have `settings` (jsonb, default `{}`). Keys and defaults are in `docs/SETTINGS.md`; only values that differ from the default are stored. They're validated by `src/lib/settings/schema.ts` and read only through `src/lib/settings/resolve.ts` (lease → tenant → building → organization → default; billing-entity keys apply to that entity's invoice series).

## Organization and people

**organizations**: name, legal_name, pan, logo_path, settings (jsonb).

**memberships**: user_id (Supabase auth user; null until an invited person accepts), email (lower-case; unique per organization, as is user_id), role (`owner`, `accounts`, `property_manager`, `viewer`), invited_by, status (`invited`, `active`, `removed`), invite_token_hash (SHA-256 of the invite link's token while the invite is open; unique; cleared on accept).

**billing_entities**: the GSTIN an invoice is issued from. legal_name, gstin, state_code, address, bank_name, bank_account_name, bank_account_number, ifsc, upi_id, settings (jsonb).

## Property

**buildings**: name, address, city, state_code, billing_entity_id, invoice_prefix, credit_note_prefix, settings (jsonb). The building defaults for GST rate, SAC code, due days and charge timing are setting overrides in `settings`, not columns (D13).

**floors**: building_id, label (unique per building), sort_order. Optional; small buildings can skip floors.

**units**: building_id, floor_id (nullable; must be a floor of the same building), code (unique per building), carpet_area (hundredths sq ft), chargeable_area (hundredths sq ft), status (`vacant`, `leased`, `fit_out`, `blocked`).

## Tenants and leases

**tenants**: company_name, gstin (nullable), pan, billing_address, state_code, TDS per charge type (`docs/BILLING_RULES.md` section 10): deducts_tds_rent, tds_rate_bp_rent, deducts_tds_cam, tds_rate_bp_cam, deducts_tds_parking, tds_rate_bp_parking, deducts_tds_other, tds_rate_bp_other (utilities, signage, other); TDS columns default to on at 1000 bp, as for a company, settings (jsonb), notes.

**tenant_contacts**: tenant_id, name, role (`billing`, `admin`, `legal`, `other`), email, phone, whatsapp (bool), is_primary (at most one per tenant).

**leases**: tenant_id, building_id, status (`draft`, `active`, `in_notice`, `expired`, `terminated`, `renewed`: an earlier version replaced by a renewal or amendment), start_date, end_date (inclusive; not before the start), lock_in_end_date, notice_period_months, rent_free_months, rent_free_days (both default 0; at most one non-zero), rent_commencement_date (derived with `rentCommencement` from `src/lib/billing/rent-free.ts`, stored), area_basis (`carpet`, `chargeable`; default `chargeable`), deposit_amount, version (int, from 1), replaces_lease_id (same organization; for renewals and amendments), signed_document_id (no foreign key until `documents` exists), settings (jsonb).

**lease_units**: lease_id, building_id, unit_id (unique per lease), area (hundredths sq ft of the lease's area basis, copied at signing so later unit edits don't change billing). building_id is part of both foreign keys, so a lease covers only units of its own building.

**lease_charges**: lease_id, type (`rent`, `cam`, `parking`, `utilities`, `signage`, `other`), basis (`fixed`, `per_sqft`, `per_slot`), rate_or_amount (paise: per period for fixed, monthly per sq ft or per slot otherwise), quantity (slots; set only for `per_slot`), start_date, end_date (nullable: to the end of the lease), frequency (`monthly`, `quarterly`), timing (`advance`, `arrears`), gst_rate_bp, sac_code, waived_during_rent_free, label. Timing, GST rate and SAC are never blank: building defaults are copied on save (D16).

**escalation_rules**: lease_id, charge_ids (uuid array of the lease's charges; null means every rent charge, the engine's `appliesTo: "rent"`), percent_bp (> 0), every_months (> 0), anchor (`lease_start`, `rent_commencement`, `custom`), anchor_date (set exactly when the anchor is `custom`), compounding (default true).

**custom_escalations**: lease_id, charge_id (must be a charge of the same lease), effective_date (unique per charge), new_amount (nullable), percent_bp (nullable); exactly one of the two is set.

**critical_dates**: lease_id, type (`expiry`, `lock_in_end`, `escalation`, `renewal_option`, `notice_deadline`, `custom`), date, remind_days (int array, e.g. {180, 90, 30}), assigned_to (auth user; no foreign key into the auth schema), status (`open`, `done`, `snoozed`), snoozed_until (set exactly when snoozed), label (required for `custom`).

## Billing

**invoice_series**: billing_entity_id, kind (`invoice`, `credit_note`), financial_year (short form as printed, `26-27`), prefix, next_number (from 1). Unique per billing entity, kind, financial year and prefix. Row-locked when assigning numbers; a trigger lets `next_number` only go up and refuses deletes.

**invoices**: tenant_id, lease_id, building_id, billing_entity_id, run_month (first day of the monthly run that made it; one invoice per lease per run unless cancelled), series_id and number (both null while draft, both set when sent), invoice_date, due_date, period_start, period_end, status (`draft`, `sent`, `part_paid`, `paid`, `overdue`, `cancelled`), place_of_supply (building's state code), supply_type (`intra_state`, `inter_state`), taxable_total, cgst_total, sgst_total, igst_total, round_off, grand_total (= the sum of the five; checked), expected_tds, supplier and recipient (jsonb copies of the billing entity's and tenant's details made when sent, D18; the recipient copy also holds the property line, building, address and units, D24; printed from these), pdf_path, sent_at, sent_to (text array). Once sent, only the status changes (never back to draft) and the PDF path can be filled in once.

**invoice_lines**: invoice_id, lease_id and charge_id (the lease is in both foreign keys, so a line bills a charge of its own invoice's lease), charge_type, position (order on the invoice, from 1), description, period_start, period_end, quantity_label (e.g. "1,250.50 sq ft × ₹85.50"), sac_code, taxable_amount, gst_rate_bp, cgst, sgst, igst, explanation (jsonb `{amount, tax}`: how the amount and its tax were calculated, shown when the user taps it). Changed only while the invoice is a draft.

**credit_notes**: invoice_id (a sent invoice), series_id, number (assigned when issued; there are no draft credit notes), date, reason (`correction`, `waiver`, `discount`, `other`), note, supply_type (copied from the invoice), taxable_amount, cgst, sgst, igst, round_off, total (positive: what is taken off the invoice), pdf_path, created_by. Never changed or deleted.

**credit_note_lines**: credit_note_id, invoice_id, invoice_line_id (a line of the same invoice; the invoice is in both foreign keys), description, taxable_amount, gst_rate_bp, cgst, sgst, igst. The part of each invoice line the credit note takes off, so the tax split follows the original (BILLING_RULES section 12). Append-only.

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
