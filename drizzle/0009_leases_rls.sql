-- Leases: owners and property managers write (docs/PRODUCT_PLAN.md roles);
-- accounts and viewers read. Only owners delete, and the app deletes only
-- drafts: a lease that has billed is ended, not deleted.
SELECT app.apply_org_policies('leases', '{owner,property_manager}', '{owner}');--> statement-breakpoint
SELECT app.apply_org_policies('lease_units', '{owner,property_manager}', '{owner}');
