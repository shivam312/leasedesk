-- An opening balance is locked while money is applied to it (billing review
-- M10). Once every payment applied to it has been reversed (the allocations
-- net to zero), a wrong amount or date can be put right. It still can't be
-- removed: the payment and its reversal point at it.
CREATE OR REPLACE FUNCTION app.guard_opening_balance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM public.payment_allocations WHERE opening_balance_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'An opening balance can''t be removed once a payment has been applied to it';
    END IF;
    RETURN OLD;
  END IF;
  IF (
    SELECT coalesce(sum(amount_settled), 0)
    FROM public.payment_allocations WHERE opening_balance_id = OLD.id
  ) <> 0 THEN
    RAISE EXCEPTION 'An opening balance can''t be changed while a payment is applied to it';
  END IF;
  IF NEW.tenant_id <> OLD.tenant_id OR NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'An opening balance can''t move to another tenant';
  END IF;
  RETURN NEW;
END;
$$;
