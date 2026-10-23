-- Lease terms follow the lease (0009): owners and property managers write,
-- accounts and viewers read, only owners delete.
SELECT app.apply_org_policies('lease_charges', '{owner,property_manager}', '{owner}');--> statement-breakpoint
SELECT app.apply_org_policies('escalation_rules', '{owner,property_manager}', '{owner}');--> statement-breakpoint
SELECT app.apply_org_policies('custom_escalations', '{owner,property_manager}', '{owner}');--> statement-breakpoint
SELECT app.apply_org_policies('critical_dates', '{owner,property_manager}', '{owner}');
