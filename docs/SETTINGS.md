# Settings catalog

Every behaviour that can differ between landlords is a setting with a safe default, listed here. Most customers never change any of them. See `docs/AUTONOMY.md` for when to add one and how.

**Scopes** (most specific wins): `lease` → `tenant` → `building` → `organization` → default.
**Shown:** `basic` = visible on the settings page; `advanced` = behind "More options".
**Marks:** [CA] = to be confirmed by a chartered accountant. [Pilot] = to be checked against a pilot landlord's real invoices.

When a setting is built, tick it and note where it lives in code.

**Status (end of M8; M8 added no settings):** every key below is defined, with its options, default, scopes and visibility, in `src/lib/settings/schema.ts` (stored as flat keys such as `"invoice.dueDays"` in the `settings` jsonb columns; a test checks the file against this table). Settings that are columns instead of jsonb keys (`tds.rateBp`, `tds.appliesTo`, `invoice.prefix`, `billing.waivedDuringRentFree`) are listed in `COLUMN_SETTINGS` there. Resolution is built: `src/lib/settings/resolve.ts` (pure: lease → tenant → building → organization → default, plus billing-entity numbering keys; it throws on an invalid stored value rather than falling back) and `src/lib/settings/store.ts` (loads the levels through `withOrg`, saves and logs them). At the organization level only values that differ from the default are stored; at lower levels a stored value means "set here", even if it equals the default (D15). The lease level is the `leases.settings` jsonb, which callers pass in as `leaseSettings` (the lease actions pass the form's values, so the review step and the save resolve the same settings, D20). The lease form's "More options for this lease" step shows every key with a `lease` scope (`keysForScope("lease")`, the same labels as Settings → Billing rules). `billing.waivedDuringRentFree` isn't on the lease form yet: saved charges take its default (rent waived, other charges not; `src/lib/leases/charges-form.ts`). The engine receives one `BillingSettings` object (`src/lib/billing/types.ts`), built from the resolved settings by `billingSettings()` in `src/lib/settings/billing.ts`. Settings → Billing rules (`/settings/billing-rules`, and `/settings/billing-rules/buildings/<id>` for building defaults) shows every setting whose behaviour is built, with a plain label and an example (`src/lib/settings/labels.ts`); advanced ones sit under "More options". `invoice.runDay` ("Day to make invoices") is shown there since M4; `invoice.numberFormat` and `invoice.startingNumber` are built and resolved per billing entity but have no screen yet (backlog). Reminders appear there since M5 (the tenant-level `reminders.autoSend` is on the tenant form); alerts since M6, under "More options". The Tally ledger names (`tally.*`, since M7) are on their own page, Settings → Tally (`/settings/tally`), with each tenant's `tally.partyLedger` under "More options" there; only owners can save them (backlog). Saving keeps stored keys the page doesn't show. A tick here means the billing engine already takes the option as an input, so only storage, resolution and UI are missing. "Fixed" means the engine hard-codes the default and the other options still need building. Paths are under `src/lib/billing/`.

## Billing

| Built | Key | Scope | Options | Default | Shown | Why landlords differ | In code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [x] | `billing.roundIncreasedRent` | organization, building, lease | `none`, `rupee` | `rupee` | advanced | Some leases specify exact paise; most landlords bill whole rupees [Pilot] | `BillingSettings.roundIncreasedRent` (`types.ts`), used by `amountSteps` in `escalation.ts`; rent charges only |
| [x] | `billing.roundInvoiceTotal` | organization | `none`, `rupee` | `rupee` | advanced | Round-off line on invoices is common but not universal [CA] | `BillingSettings.roundInvoiceTotal`, used by `invoiceTotals` in `gst.ts` |
| [x] | `billing.partPeriodMethod` | organization, lease | `month_by_month`, `days_in_period` | `month_by_month` | advanced | How a part quarter is pro-rated [Pilot] (D-001) | `BillingSettings.partPeriodMethod`, used by `segmentsForPeriod` in `proration.ts` (quarterly charges only) |
| [x] | `billing.monthEndRule` | organization, lease | `roll_forward` (to the 1st), `last_day` | `roll_forward` | advanced | Dates like 31 Jan + 1 month: never bill a day early by default | `BillingSettings.monthEndRule`, passed to `addMonths` in `dates.ts` by `rentCommencement` (`rent-free.ts`) and `amountSteps` (`escalation.ts`) |
| [x] | `billing.midMonthIncreaseLines` | organization | `one_line`, `two_lines` | `two_lines` | advanced | Some accountants prefer one combined line | `BillingSettings.midMonthIncreaseLines`, used by `linesFor` in `invoice-lines.ts` |
| [x] | `billing.afterCustomIncrease` | lease | `stop_rule`, `resume_rule` | `stop_rule` | advanced (lease form) | Whether the automatic increase rule continues after a custom increase [Pilot] (D-002) | `BillingSettings.afterCustomIncrease`, used by `amountSteps` in `escalation.ts`; `resume_rule` restarts the rule from the custom date |
| [x] | `billing.defaultTiming` | building, charge | `advance`, `arrears` | `advance` | advanced | Rent is usually in advance; utilities often in arrears | `Charge.timing` in `types.ts`. Building default copied onto a new charge when the lease is saved: `withBuildingDefaults` in `src/lib/settings/charge-defaults.ts` (D16) |
| [x] | `billing.waivedDuringRentFree` | charge | `true`, `false` | `true` for rent, `false` for other charges | advanced (lease form) | Some leases waive CAM or parking during fit-out too | `Charge.waivedDuringRentFree` in `types.ts`, default in `withChargeDefaults` (`charges.ts`) |
| [x] | `billing.skipZeroInvoices` | organization | `true`, `false` | `true` | advanced | Avoid using invoice numbers on ₹0 bills | `BillingSettings.skipZeroInvoices`, used by `invoiceForRun` in `invoice-lines.ts` |

## GST

| Built | Key | Scope | Options | Default | Shown | Why landlords differ | In code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [x] | `gst.defaultRateBp` | building, charge | basis points | `1800` | basic | Rate for renting commercial property [CA] | `Charge.gstRateBp` (required) in `types.ts`. Building default copied onto a new charge when the lease is saved: `withBuildingDefaults` (`src/lib/settings/charge-defaults.ts`, D16) |
| [x] | `gst.defaultSac` | building, charge | SAC code | `997212` | basic | Service code on invoices [CA] | `Charge.sacCode` (required) in `types.ts`. Building default copied onto a new charge when the lease is saved: `withBuildingDefaults` (`src/lib/settings/charge-defaults.ts`, D16) |
| [x] | `gst.rounding` | organization | `per_line`, `per_invoice` | `per_line` | advanced | Accountants differ on where tax is rounded [CA] (D-004) | `BillingSettings.gstRounding`, used by `invoiceTax` in `gst.ts`, called by `draftInvoice` with a stable line key (charge id + period start) |

## TDS

TDS is set per charge type on the tenant: `rent`, `cam`, `parking` and `other` (utilities, signage and other charges). See D10 in `docs/DECISIONS.md`.

| Built | Key | Scope | Options | Default | Shown | Why landlords differ | In code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [x] | `tds.rateBp` | tenant, per charge type | basis points | `1000` for every type | basic | Rate depends on the tenant and the law [CA] (D-003) | `TenantTds[type].tdsRateBp` in `tds.ts`; defaults in `tenantTdsDefaults` |
| [x] | `tds.appliesTo` | tenant | on/off per charge type | on for every type (companies), off for every type otherwise | advanced | Tenants treat CAM, parking and utilities differently [CA] (D-003) | `TenantTds[type].deductsTds` in `tds.ts`; defaults in `tenantTdsDefaults` |
| [x] | `tds.rounding` | organization, tenant | `paisa`, `rupee` | `rupee` | advanced | Most deductors round to the rupee [CA] (D-003) | `BillingSettings.tdsRounding`, used by `expectedTds` in `tds.ts` (`sumOfPercentsToRupee` or `sumOfPercentsToPaisa` in `money.ts`) |
| [x] | `tds.tolerancePaise` | organization | paise | `100` (₹1) | advanced | How far a short payment can be from expected TDS and still count as "paid with TDS" | `BillingSettings.tdsTolerancePaise`, used by `suggestTds` and `invoiceSettlement` in `allocation.ts` and `amountFit` in `src/lib/bank/matching.ts` |
| [x] | `tds.quarterBasis` | organization | `payment_date`, `invoice_date` | `payment_date` | advanced | Which quarter a TDS amount is tracked under [CA] (D-003) | `BillingSettings.tdsQuarterBasis`, used by `tdsQuarter` in `tds.ts` |

## Invoices

| Built | Key | Scope | Options | Default | Shown | Why landlords differ | In code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [x] | `invoice.prefix` | building | text, ≤5 chars | building initials | basic | Each building often has its own series | `buildings.invoice_prefix` and `credit_note_prefix`, used by `takeNumber` in `src/lib/invoices/numbering.ts` (D9). No default yet |
| [x] | `invoice.numberFormat` | billing entity | template | `{prefix}/{fy}/{seq}` | advanced | Existing numbering must continue when they switch to us | `format` input of `invoiceNumber` in `src/lib/invoices/number.ts` (`{prefix}`, `{fy}` = 26-27, `{seq}` = 4 digits, all three required so numbers can't repeat; still ≤ 16 characters). Not on a settings screen yet |
| [x] | `invoice.startingNumber` | billing entity, per FY | first number per financial year, e.g. `{"2026-27": 412}` | `{}` (start at 1 every year) | basic (onboarding) | Customers join mid-year with numbers already used | `firstNumber` in `src/lib/invoices/number.ts`, used when `takeNumber` creates a series (each prefix of the entity starts there). Not on a settings screen yet |
| [x] | `invoice.dueDays` | building, tenant | days | `7` | basic | Payment terms vary by lease | `BillingSettings.dueDays`, used by `invoiceForRun` in `invoice-lines.ts` |
| [x] | `invoice.runDay` | organization | day of month, 1–28 | `1` | basic | Some landlords bill on the 25th for the next month | When the scheduled run makes drafts: `scheduledRunMonth` in `src/lib/invoices/schedule.ts` (1 = that month, on the 1st; a later day = the next month's, ahead of time). Invoices are still dated the 1st of their month (`invoiceForRun`) |

## Tally export

Ledger names in the Tally file (`src/lib/exports/tally.ts`). Every accountant names ledgers differently, so the defaults are only a start; they are set on Settings → Tally.

| Built | Key | Scope | Options | Default | Shown | Why landlords differ | In code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [x] | `tally.ledgerRent` | organization | ledger name, ≤100 characters | `Rent Income` | advanced | Accountants name ledgers their own way | Ledger for rent lines of invoices and credit notes: `tallyLedgers` in `src/lib/exports/tally-data.ts` |
| [x] | `tally.ledgerMaintenance` | organization | ledger name, ≤100 characters | `Maintenance Income` | advanced | Accountants name ledgers their own way | Ledger for maintenance (CAM) lines: `tallyLedgers` in `src/lib/exports/tally-data.ts` |
| [x] | `tally.ledgerOtherIncome` | organization | ledger name, ≤100 characters | `Other Income` | advanced | Accountants name ledgers their own way | Ledger for parking, utilities, signage and other charges: `tallyLedgers` in `src/lib/exports/tally-data.ts` |
| [x] | `tally.ledgerCgst` | organization | ledger name, ≤100 characters | `Output CGST` | advanced | Accountants name ledgers their own way | Ledger for CGST on invoices and credit notes: `tallyLedgers` in `src/lib/exports/tally-data.ts` |
| [x] | `tally.ledgerSgst` | organization | ledger name, ≤100 characters | `Output SGST` | advanced | Accountants name ledgers their own way | Ledger for SGST: `tallyLedgers` in `src/lib/exports/tally-data.ts` |
| [x] | `tally.ledgerIgst` | organization | ledger name, ≤100 characters | `Output IGST` | advanced | Accountants name ledgers their own way | Ledger for IGST: `tallyLedgers` in `src/lib/exports/tally-data.ts` |
| [x] | `tally.ledgerTds` | organization | ledger name, ≤100 characters | `TDS Receivable` | advanced | Accountants name ledgers their own way | Ledger for TDS kept back by tenants, on receipts: `tallyLedgers` in `src/lib/exports/tally-data.ts` |
| [x] | `tally.ledgerRoundOff` | organization | ledger name, ≤100 characters | `Round Off` | advanced | Accountants name ledgers their own way | Ledger for the invoice round off: `tallyLedgers` in `src/lib/exports/tally-data.ts` |
| [x] | `tally.ledgerBank` | organization | ledger name, ≤100 characters | `Bank Account` | advanced | Accountants name ledgers their own way | Ledger for money received, on receipts: `tallyLedgers` in `src/lib/exports/tally-data.ts` |
| [x] | `tally.partyLedger` | tenant | ledger name, ≤100 characters, blank for the company name | `` | advanced | A tenant's ledger in Tally may not match its name here | The tenant's party ledger: `tallyLedgers` in `src/lib/exports/tally-data.ts` |

## Reminders and alerts

| Built | Key | Scope | Options | Default | Shown | Why landlords differ | In code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [x] | `reminders.beforeDueDays` | organization | list of days | `[3]` | basic | Some prefer no pre-reminder | `reminderDue` in `src/lib/reminders/schedule.ts`; typed "3" on Settings → Billing rules, blank for none |
| [x] | `reminders.afterDueDays` | organization | list of days | `[1, 7, 15]` | basic | How hard to chase | `reminderDue`; typed "1, 7, 15", blank for none |
| [x] | `reminders.autoSend` | organization, tenant | `true`, `false` | `true` | basic | Some owners want to approve reminders to key tenants | `claimDueReminders` in `src/lib/reminders/run.ts`; organization on Settings → Billing rules, tenant under "More options" on the tenant form |
| [x] | `alerts.dailyDigest` | organization | `true`, `false` | `true` | basic | Some owners don't want daily email for the team | `sendDigests` in `src/lib/alerts/digest-run.ts`; who gets which items: `digestItemsFor` in `src/lib/alerts/digest.ts` (D36) |
| [x] | `alerts.expiryDays` | organization | list of days | `[180, 90, 30]` | advanced | Renewal lead times differ | Copied onto each lease's expiry date when the lease is saved (`criticalDatesFor` in `src/lib/leases/critical-dates.ts`); saving Billing rules updates dates not yet done (`applyReminderDays` in `src/lib/alerts/dates.ts`). A date shows on Today from its longest reminder (`dateShows` in `src/lib/alerts/attention.ts`) |
| [x] | `alerts.increaseDays` | organization | list of days | `[30, 7]` | advanced | How far ahead to plan a rent increase | As `alerts.expiryDays`, for rent increases |
| [x] | `alerts.lockInDays` | organization | list of days | `[60]` | advanced | How early to know a tenant may leave | As `alerts.expiryDays`, for lock-in ends |
