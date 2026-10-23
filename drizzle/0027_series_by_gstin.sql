-- Number series are kept per GSTIN, not per billing entity (BILLING_RULES
-- section 9, Codex review M4): two billing entities with the same GSTIN now
-- share a series, so no number is given out twice under one GSTIN. Existing
-- series take the GSTIN printed on their invoices (or on the invoices their
-- credit notes correct), else their billing entity's, else (no GSTIN at all,
-- which sending refuses) the entity's id, so they stay apart. The series
-- guard lets only next_number change, so it is paused for the backfill.
ALTER TABLE "invoice_series" DROP CONSTRAINT "invoice_series_billingEntityId_kind_financialYear_prefix_unique";--> statement-breakpoint
ALTER TABLE "invoice_series" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "invoice_series" DISABLE TRIGGER invoice_series_guard;--> statement-breakpoint
UPDATE "invoice_series" s SET "gstin" = coalesce(
  (SELECT i.supplier->>'gstin' FROM "invoices" i WHERE i.series_id = s.id AND i.supplier->>'gstin' IS NOT NULL LIMIT 1),
  (SELECT i.supplier->>'gstin' FROM "credit_notes" c JOIN "invoices" i ON i.id = c.invoice_id WHERE c.series_id = s.id AND i.supplier->>'gstin' IS NOT NULL LIMIT 1),
  (SELECT upper(regexp_replace(b.gstin, '\s', '', 'g')) FROM "billing_entities" b WHERE b.id = s.billing_entity_id),
  s.billing_entity_id::text
);--> statement-breakpoint
ALTER TABLE "invoice_series" ENABLE TRIGGER invoice_series_guard;--> statement-breakpoint
ALTER TABLE "invoice_series" ALTER COLUMN "gstin" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_series" ADD CONSTRAINT "invoice_series_organizationId_gstin_kind_financialYear_prefix_unique" UNIQUE("organization_id","gstin","kind","financial_year","prefix");
