-- Daily digests: members read their organization's; only the daily job
-- (as the database owner, D22) writes them; nobody deletes. A digest is a
-- record of what was sent: the only change is its status, once, out of
-- "sending".
SELECT app.apply_org_policies('digest_sends', '{}', '{}');--> statement-breakpoint

CREATE FUNCTION app.guard_digest_send() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A digest record can''t be deleted';
  END IF;
  IF OLD.status <> 'sending' OR NEW.status = 'sending'
     OR (to_jsonb(NEW) - 'status' - 'updated_at')
        IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'A digest record can''t be changed once it has been sent';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER digest_sends_guard
  BEFORE UPDATE OR DELETE ON public.digest_sends
  FOR EACH ROW EXECUTE FUNCTION app.guard_digest_send();
