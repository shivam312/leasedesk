-- Exports: members read their organization's; owners and accounts record one
-- when they download a Tally file; nobody changes or deletes one, so the
-- record of what was handed to the accountant stays true.
SELECT app.apply_org_policies('exports', '{owner,accounts}', '{}');--> statement-breakpoint

CREATE FUNCTION app.guard_export() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'An export record can''t be changed or deleted';
END;
$$;--> statement-breakpoint
CREATE TRIGGER exports_guard
  BEFORE UPDATE OR DELETE ON public.exports
  FOR EACH ROW EXECUTE FUNCTION app.guard_export();
