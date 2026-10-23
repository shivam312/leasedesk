ALTER TABLE "bank_statement_lines" ADD COLUMN "suggested_tds_amount" bigint;--> statement-breakpoint
-- The suggested TDS is part of how a line is matched, so it may change too.
CREATE OR REPLACE FUNCTION app.guard_bank_statement_line() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'An imported bank line can''t be deleted; mark it ignored';
  END IF;
  IF (to_jsonb(NEW) - 'match_status' - 'suggested_tenant_id' - 'suggested_invoice_ids' - 'suggested_tds_amount' - 'confidence' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'match_status' - 'suggested_tenant_id' - 'suggested_invoice_ids' - 'suggested_tds_amount' - 'confidence' - 'updated_at') THEN
    RAISE EXCEPTION 'Only how a bank line is matched can change';
  END IF;
  RETURN NEW;
END;
$$;
