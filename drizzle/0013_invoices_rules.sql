-- Invoices and credit notes: owners and accounts write (docs/PRODUCT_PLAN.md
-- roles); property managers and viewers read. Drafts can be deleted; nothing
-- sent can (D4), which the triggers below enforce for every role.
SELECT app.apply_org_policies('invoice_series', '{owner,accounts}', '{}');--> statement-breakpoint
SELECT app.apply_org_policies('invoices', '{owner,accounts}', '{owner,accounts}');--> statement-breakpoint
SELECT app.apply_org_policies('invoice_lines', '{owner,accounts}', '{owner,accounts}');--> statement-breakpoint
SELECT app.apply_org_policies('credit_notes', '{owner,accounts}', '{}');--> statement-breakpoint
SELECT app.apply_org_policies('credit_note_lines', '{owner,accounts}', '{}');--> statement-breakpoint

-- A sent invoice keeps its amounts, dates, number and copied details. Only
-- its status moves on (sent → part_paid, paid, overdue, cancelled; never
-- back to draft), and its PDF path can be filled in once.
CREATE FUNCTION app.guard_invoice() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'A sent invoice can''t be deleted; issue a credit note';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' THEN
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'A sent invoice can''t go back to draft';
    END IF;
    IF OLD.pdf_path IS NOT NULL AND NEW.pdf_path IS DISTINCT FROM OLD.pdf_path THEN
      RAISE EXCEPTION 'A sent invoice''s PDF can''t be replaced';
    END IF;
    IF (to_jsonb(NEW) - 'status' - 'pdf_path' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'pdf_path' - 'updated_at') THEN
      RAISE EXCEPTION 'A sent invoice can''t be changed; issue a credit note';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER invoices_guard
  BEFORE UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION app.guard_invoice();--> statement-breakpoint

-- Lines change only while their invoice is a draft.
CREATE FUNCTION app.guard_invoice_line() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  inv uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.invoice_id <> OLD.invoice_id THEN
    RAISE EXCEPTION 'An invoice line can''t move to another invoice';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = inv AND i.status <> 'draft') THEN
    RAISE EXCEPTION 'A sent invoice''s lines can''t be changed; issue a credit note';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint
CREATE TRIGGER invoice_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION app.guard_invoice_line();--> statement-breakpoint

-- A credit note is against a sent invoice, and is never changed afterwards
-- except to fill in its PDF path once.
CREATE FUNCTION app.guard_credit_note() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A credit note can''t be deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = NEW.invoice_id AND i.status NOT IN ('draft', 'cancelled')
    ) THEN
      RAISE EXCEPTION 'A credit note needs a sent invoice';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.pdf_path IS NOT NULL AND NEW.pdf_path IS DISTINCT FROM OLD.pdf_path THEN
    RAISE EXCEPTION 'A credit note''s PDF can''t be replaced';
  END IF;
  IF (to_jsonb(NEW) - 'pdf_path' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'pdf_path' - 'updated_at') THEN
    RAISE EXCEPTION 'A credit note can''t be changed';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER credit_notes_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION app.guard_credit_note();--> statement-breakpoint
CREATE TRIGGER credit_note_lines_append_only
  BEFORE UPDATE OR DELETE ON public.credit_note_lines
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change();--> statement-breakpoint

-- A series only counts up, so a number is never handed out twice.
CREATE FUNCTION app.guard_invoice_series() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A number series can''t be deleted';
  END IF;
  IF NEW.next_number < OLD.next_number
     OR (to_jsonb(NEW) - 'next_number' - 'updated_at')
        IS DISTINCT FROM (to_jsonb(OLD) - 'next_number' - 'updated_at') THEN
    RAISE EXCEPTION 'A number series only counts up';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER invoice_series_guard
  BEFORE UPDATE OR DELETE ON public.invoice_series
  FOR EACH ROW EXECUTE FUNCTION app.guard_invoice_series();
