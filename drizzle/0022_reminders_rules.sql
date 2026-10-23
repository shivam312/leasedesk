-- Reminders: members read; owners and accounts send them (PERMISSIONS
-- manage_billing); nobody deletes. A reminder is a record of what was sent:
-- the only change is its status, once, out of "sending".
SELECT app.apply_org_policies('reminders', '{owner,accounts}', '{}');--> statement-breakpoint

CREATE FUNCTION app.guard_reminder() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A reminder can''t be deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = NEW.invoice_id AND i.status NOT IN ('draft', 'cancelled')
    ) THEN
      RAISE EXCEPTION 'Only a sent invoice can have a reminder';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'sending' OR NEW.status = 'sending'
     OR (to_jsonb(NEW) - 'status' - 'sent_to' - 'updated_at')
        IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'sent_to' - 'updated_at') THEN
    RAISE EXCEPTION 'A reminder can''t be changed once it has been sent';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER reminders_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION app.guard_reminder();
