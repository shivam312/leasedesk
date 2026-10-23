# Independent review of M8 (Codex)

**Verdict:** pass

M8 adds password reset, error reporting, a full billing journey test and several UX improvements. I found no wrong money calculation or other must-fix defect in the changed code; the three checked billing examples match the written rules. The code supports the milestone report’s main feature claims, but I could not independently verify that the UX reviews occurred or that the reported test totals passed. The founder should review the listed human tasks and backlog items before treating the product as ready for a pilot.

## Must fix (0)

None.

## Should fix (0)

None.

## Verified by hand

- Compared the diff stat and changed files against the specified commit range; reviewed the required specs, roadmap and M8 report.
- By hand: ₹90,015.71 increased by 5% is ₹94,516 when rounded directly to the rupee; this matches BILLING_RULES.md §2.
- By hand: ₹30,000 quarterly from 15 May under days_in_period is ₹30,000 × 47 ÷ 91 = ₹15,494.51; this matches BILLING_RULES.md §7.
- By hand: the journey test’s ₹1,00,000 rent yields ₹9,000 CGST and ₹9,000 SGST at 18%, totaling ₹1,18,000; ₹10,000 TDS leaves ₹1,08,000 payable. The second lease’s ₹50,000 rent yields ₹4,500 each in CGST and SGST, totaling ₹59,000.
- Confirmed the password reset form validates email and matching passwords, and `safeNext` rejects external redirect targets.
- Confirmed reset email origins use APP_URL or a loopback host, and the auth confirmation route exchanges the code or verifies the token before redirecting.
- Confirmed Sentry options are disabled without the relevant DSN and scrub request bodies, cookies, query strings, error text, breadcrumbs and extra data before sending.
- Confirmed the M8 report’s listed changes for the error pages, import problem limit and Today empty state appear in the changed code. The report also explicitly lists outstanding human setup and pilot tasks.
