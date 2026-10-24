# UX principles

The app should feel like a monthly routine, not a database. A property manager who has never used it should be able to add a lease and send a month's invoices without help.

## The rules

1. **Five menu items:** Today, Leases, Tenants, Billing, Reports. Settings sits behind the profile icon. Nothing else goes in the main nav.
2. **Built around the month.** Today shows what to do now: send this month's invoices, chase unpaid tenants, act on upcoming escalations and expiries.
3. **Defaults, not settings.** Building-level defaults (GST rate, SAC, due days, reminder schedule, invoice prefix) are inherited by every lease. Ask for a value only when there's no sensible default.
4. **Progressive disclosure.** Basic fields first. Advanced fields (rent-free days, quarterly billing, arrears, custom escalations, per-charge GST) sit behind "More options".
5. **Bulk actions on every list:** select many, then send, remind, mark paid, export.
6. **Plain words.** Use the glossary below. Accounting terms only in reports.
7. **Every amount explains itself.** Tapping an amount shows how it was calculated, in a sentence.
8. **Every screen ends in an action.** A list of problems always has the button that fixes them.
9. **Phone first for the owner, table-dense for the accountant.** Lists become cards below 768px wide (Tailwind `md`), the same width at which the nav switches from bottom tabs to the sidebar. Billing tables stay usable on a laptop with keyboard navigation.
10. **No custom fields or per-customer workflows.** If several customers need something, it becomes a feature for everyone.

## Screen checklist

Before a screen is done:

- [ ] The main action is the most prominent button, and there is only one primary button
- [ ] Empty state says what this screen is for and offers the first action ("No leases yet. Add your first lease or import from Excel.")
- [ ] Loading state and error state exist; errors are plain sentences with a next step
- [ ] Works at 375px wide (phone) and 1280px wide (laptop)
- [ ] All amounts use `formatINR`, all dates use `formatDate`
- [ ] Destructive actions ask for confirmation and say what will happen
- [ ] Lists with more than 20 rows have search and filters
- [ ] Copy uses the glossary words
- [ ] Keyboard: Tab order is sensible; forms submit with Enter

## Glossary: what we say in the UI

| Don't say | Say |
| --- | --- |
| Escalation | Rent increase |
| Escalation rule, compounding | Rent goes up 5% every 12 months |
| Lessee, licensee | Tenant |
| Lessor, licensor | Owner |
| Rent commencement date | Rent starts on |
| Lock-in period | Lock-in (can't leave before) |
| Receivable, outstanding receivable | Unpaid |
| Ageing bucket 31–60 | Overdue 1–2 months |
| Allocation | Apply payment to invoices |
| Reconciliation | Match payments |
| Chargeable area / super built-up | Billed area |
| Void, cancel invoice | Issue a credit note |
| Draft invoice | Not sent yet |
| CAM | Maintenance (CAM) |
| Form 16A | TDS certificate |

Reports for accountants can use the technical terms, with the plain term shown once in a tooltip.

## Tone

Short, specific, friendly. "Sent 42 invoices. 3 tenants have no email; send by WhatsApp instead?" rather than "Operation completed with warnings."

When something fails and the user can't fix it themselves, show the support contact (WhatsApp +91 98111 29108, support@leasedesk.com) with `SupportContact`, never a hand-typed address; it lives in `src/lib/support.ts` (D-029). The error pages and Settings → Help show it.
