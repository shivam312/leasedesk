-- Bank accounts and imported statements: owners and accounts write; only an
-- owner deletes a bank account (and only one with nothing imported, since
-- imports restrict it). Imports and their lines are a record of what the
-- bank said, so they are never deleted, and a line only changes how it is
-- matched.
SELECT app.apply_org_policies('bank_accounts', '{owner,accounts}', '{owner}');--> statement-breakpoint
SELECT app.apply_org_policies('bank_statement_imports', '{owner,accounts}', '{}');--> statement-breakpoint
SELECT app.apply_org_policies('bank_statement_lines', '{owner,accounts}', '{}');--> statement-breakpoint
CREATE TRIGGER bank_statement_imports_append_only
  BEFORE UPDATE OR DELETE ON public.bank_statement_imports
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change();--> statement-breakpoint

CREATE FUNCTION app.guard_bank_statement_line() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'An imported bank line can''t be deleted; mark it ignored';
  END IF;
  IF (to_jsonb(NEW) - 'match_status' - 'suggested_tenant_id' - 'suggested_invoice_ids' - 'confidence' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'match_status' - 'suggested_tenant_id' - 'suggested_invoice_ids' - 'confidence' - 'updated_at') THEN
    RAISE EXCEPTION 'Only how a bank line is matched can change';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER bank_statement_lines_guard
  BEFORE UPDATE OR DELETE ON public.bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION app.guard_bank_statement_line();
