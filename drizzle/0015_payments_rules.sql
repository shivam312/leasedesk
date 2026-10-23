-- Payments, allocations and TDS records: owners and accounts write
-- (docs/PRODUCT_PLAN.md roles); nobody deletes. A payment is never edited
-- (D4, BILLING_RULES section 11): a wrong one is reversed by a reversal
-- entry, which the triggers below allow as the only change.
SELECT app.apply_org_policies('payments', '{owner,accounts}', '{}');--> statement-breakpoint
SELECT app.apply_org_policies('payment_allocations', '{owner,accounts}', '{}');--> statement-breakpoint
SELECT app.apply_org_policies('tds_records', '{owner,accounts}', '{}');--> statement-breakpoint

-- The only change to a payment: active → reversed, naming its reversal
-- entry, once.
CREATE FUNCTION app.guard_payment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A payment can''t be deleted; reverse it instead';
  END IF;
  IF OLD.status = 'reversed' OR NEW.status <> 'reversed' OR OLD.kind <> 'payment'
     OR (to_jsonb(NEW) - 'status' - 'reversed_by_payment_id' - 'updated_at')
        IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'reversed_by_payment_id' - 'updated_at') THEN
    RAISE EXCEPTION 'A payment can''t be changed; reverse it and record it again';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payments r
    WHERE r.id = NEW.reversed_by_payment_id AND r.reverses_payment_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'A payment is reversed only by its reversal entry';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER payments_guard
  BEFORE UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION app.guard_payment();--> statement-breakpoint

-- Allocations are append-only. A payment's allocations never add up to
-- more than received + TDS (DATA_MODEL invariant), and only a reversal
-- entry has negative ones. Positive amounts go only to sent invoices.
CREATE FUNCTION app.check_payment_allocation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  p public.payments%ROWTYPE;
  total bigint;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = NEW.payment_id;
  IF p.kind = 'payment' THEN
    IF NEW.amount_settled < 0 THEN
      RAISE EXCEPTION 'Only a reversal entry can take money off an invoice';
    END IF;
    IF p.status <> 'active' THEN
      RAISE EXCEPTION 'A reversed payment can''t be applied to invoices';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = NEW.invoice_id AND i.status NOT IN ('draft', 'cancelled')
    ) THEN
      RAISE EXCEPTION 'A payment can only be applied to a sent invoice';
    END IF;
    SELECT coalesce(sum(amount_settled), 0) INTO total
      FROM public.payment_allocations WHERE payment_id = NEW.payment_id;
    IF total > p.amount_received + p.tds_deducted THEN
      RAISE EXCEPTION 'A payment can''t be applied for more than was received plus TDS';
    END IF;
  ELSIF NEW.amount_settled > 0 THEN
    RAISE EXCEPTION 'A reversal entry only takes money off invoices';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER payment_allocations_check
  AFTER INSERT ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION app.check_payment_allocation();--> statement-breakpoint
CREATE TRIGGER payment_allocations_append_only
  BEFORE UPDATE OR DELETE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change();--> statement-breakpoint

-- A TDS record is never deleted; only its certificate columns change.
CREATE FUNCTION app.guard_tds_record() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A TDS record can''t be deleted';
  END IF;
  IF (to_jsonb(NEW) - 'certificate_received' - 'certificate_document_id' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'certificate_received' - 'certificate_document_id' - 'updated_at') THEN
    RAISE EXCEPTION 'Only a TDS record''s certificate can change';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER tds_records_guard
  BEFORE UPDATE OR DELETE ON public.tds_records
  FOR EACH ROW EXECUTE FUNCTION app.guard_tds_record();
