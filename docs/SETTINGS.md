# Settings catalog

Every behaviour that can differ between landlords is a setting with a safe default, listed here. Most customers never change any of them. See `docs/AUTONOMY.md` for when to add one and how.

**Scopes** (most specific wins): `lease` → `tenant` → `building` → `organization` → default.
**Shown:** `basic` = visible on the settings page; `advanced` = behind "More options".
**Marks:** [CA] = to be confirmed by a chartered accountant. [Pilot] = to be checked against a pilot landlord's real invoices.

When a setting is built, tick it and note where it lives in code.

**Status (M2, in progress):** every key below is defined, with its options, default, scopes and visibility, in `src/lib/settings/schema.ts` (stored as flat keys such as `"invoice.dueDays"` in the `settings` jsonb columns; a test checks the file against this table). Settings that are columns instead of jsonb keys (`tds.rateBp`, `tds.appliesTo`, `invoice.prefix`, `billing.waivedDuringRentFree`) are listed in `COLUMN_SETTINGS` there. Resolution is built: `src/lib/settings/resolve.ts` (pure: lease → tenant → building → organization → default, plus billing-entity numbering keys; it throws on an invalid stored value rather than falling back) and `src/lib/settings/store.ts` (loads the levels through `withOrg`, saves and logs them). At the organization level only values that differ from the default are stored; at lower levels a stored value means "set here", even if it equals the default (D15). The lease level is passed in as raw jsonb until the leases table arrives in M3. The engine receives one `BillingSettings` object (`src/lib/billing/types.ts`), built from the resolved settings by `billingSettings()` in `src/lib/settings/billing.ts`. Settings → Billing rules (`/settings/billing-rules`, and `/settings/billing-rules/buildings/<id>` for building defaults) shows every setting whose behaviour is built, with a plain label and an example (`src/lib/settings/labels.ts`); advanced ones sit under "More options". Reminders, alerts and invoice numbering appear there when their features are built. Saving keeps stored keys the page doesn't show. A tick here means the billing engine already takes the option as an input, so only storage, resolution and UI are missing. "Fixed" means the engine hard-codes the default and the other options still need building. Paths are under `src/lib/billing/`.

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
| [x] | `gst.rounding` | organization | `per_line`, `per_invoice` | `per_line` | advanced | Accountants differ on where tax is rounded [CA] (D-004) | `BillingSettings.gstRounding`, used by `invoiceTax` in `gst.ts` (invoices call it from M4) |

## TDS

TDS is set per charge type on the tenant: `rent`, `cam`, `parking` and `other` (utilities, signage and other charges). See D10 in `docs/DECISIONS.md`.

| Built | Key | Scope | Options | Default | Shown | Why landlords differ | In code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [x] | `tds.rateBp` | tenant, per charge type | basis points | `1000` for every type | basic | Rate depends on the tenant and the law [CA] (D-003) | `TenantTds[type].tdsRateBp` in `tds.ts`; defaults in `tenantTdsDefaults` |
| [x] | `tds.appliesTo` | tenant | on/off per charge type | on for every type (companies), off for every type otherwise | advanced | Tenants treat CAM, parking and utilities differently [CA] (D-003) | `TenantTds[type].deductsTds` in `tds.ts`; defaults in `tenantTdsDefaults` |
| [x] | `tds.rounding` | organization, tenant | `paisa`, `rupee` | `rupee` | advanced | Most deductors round to the rupee [CA] (D-003) | `BillingSettings.tdsRounding`, used by `expectedTds` in `tds.ts` (`sumOfPercentsToRupee` or `sumOfPercentsToPaisa` in `money.ts`) |
| [x] | `tds.tolerancePaise` | organization | paise | `100` (₹1) | advanced | How far a short payment can be from expected TDS and still count as "paid with TDS" | `BillingSettings.tdsTolerancePaise`, used by `settlePayment` in `tds.ts` |
| [x] | `tds.quarterBasis` | organization | `payment_date`, `invoice_date` | `payment_date` | advanced | Which quarter a TDS amount is tracked under [CA] (D-003) | `BillingSettings.tdsQuarterBasis`, used by `tdsQuarter` in `tds.ts` |

## Invoices

| Built | Key | Scope | Options | Default | Shown | Why landlords differ | In code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [x] | `invoice.prefix` | building | text, ≤5 chars | building initials | basic | Each building often has its own series | `prefix` input of `invoiceNumber` in `invoice-number.ts` (moves to `src/lib/invoices/` in M4, D9). No default yet |
| [ ] | `invoice.numberFormat` | billing entity | template | `{prefix}/{fy}/{seq}` | advanced | Existing numbering must continue when they switch to us | Fixed to the default: `invoiceNumber` in `invoice-number.ts` |
| [ ] | `invoice.startingNumber` | billing entity, per FY | first number per financial year, e.g. `{"2026-27": 412}` | `{}` (start at 1 every year) | basic (onboarding) | Customers join mid-year with numbers already used | |
| [x] | `invoice.dueDays` | building, tenant | days | `7` | basic | Payment terms vary by lease | `BillingSettings.dueDays`, used by `invoiceForRun` in `invoice-lines.ts` |
| [ ] | `invoice.runDay` | organization | day of month | `1` | basic | Some landlords bill on the 25th for the next month | Fixed to the 1st: `invoiceForRun` in `invoice-lines.ts` |

## Reminders and alerts

| Built | Key | Scope | Options | Default | Shown | Why landlords differ | In code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [ ] | `reminders.beforeDueDays` | organization | list of days | `[3]` | basic | Some prefer no pre-reminder | |
| [ ] | `reminders.afterDueDays` | organization | list of days | `[1, 7, 15]` | basic | How hard to chase | |
| [ ] | `reminders.autoSend` | organization, tenant | `true`, `false` | `true` | basic | Some owners want to approve reminders to key tenants | |
| [ ] | `alerts.expiryDays` | organization | list of days | `[180, 90, 30]` | advanced | Renewal lead times differ | |
| [ ] | `alerts.increaseDays` | organization | list of days | `[30, 7]` | advanced | | |
| [ ] | `alerts.lockInDays` | organization | list of days | `[60]` | advanced | | |
