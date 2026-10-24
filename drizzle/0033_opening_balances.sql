CREATE TABLE "opening_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"as_on_date" date NOT NULL,
	"amount" bigint NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_balances_organizationId_tenantId_id_unique" UNIQUE("organization_id","tenant_id","id"),
	CONSTRAINT "opening_balances_amount_positive" CHECK ("opening_balances"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "opening_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_allocations" ALTER COLUMN "invoice_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tds_records" ALTER COLUMN "invoice_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD COLUMN "opening_balance_id" uuid;--> statement-breakpoint
ALTER TABLE "tds_records" ADD COLUMN "opening_balance_id" uuid;--> statement-breakpoint
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_organization_id_tenant_id_tenants_organization_id_id_fk" FOREIGN KEY ("organization_id","tenant_id") REFERENCES "public"."tenants"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opening_balances_one_per_tenant" ON "opening_balances" USING btree ("organization_id","tenant_id");--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_tenant_id_opening_balance_id_opening_balances_organization_id_tenant_id_id_fk" FOREIGN KEY ("organization_id","tenant_id","opening_balance_id") REFERENCES "public"."opening_balances"("organization_id","tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tds_records" ADD CONSTRAINT "tds_records_organization_id_tenant_id_opening_balance_id_opening_balances_organization_id_tenant_id_id_fk" FOREIGN KEY ("organization_id","tenant_id","opening_balance_id") REFERENCES "public"."opening_balances"("organization_id","tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_allocations_opening_balance_id_index" ON "payment_allocations" USING btree ("opening_balance_id");--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_one_target" CHECK (("payment_allocations"."invoice_id" is null) <> ("payment_allocations"."opening_balance_id" is null));--> statement-breakpoint
ALTER TABLE "tds_records" ADD CONSTRAINT "tds_records_one_target" CHECK (("tds_records"."invoice_id" is null) <> ("tds_records"."opening_balance_id" is null));--> statement-breakpoint
-- Members read; owners and accounts enter, change and remove an opening
-- balance (D-028: A).
SELECT app.apply_org_policies('opening_balances', '{owner,accounts}', '{owner,accounts}');--> statement-breakpoint
-- Once a payment is applied to it, an opening balance is money on the
-- books: it can't be changed or removed (a mistake is corrected by a
-- payment reversal, never by editing).
CREATE FUNCTION app.guard_opening_balance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.payment_allocations WHERE opening_balance_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'An opening balance can''t be changed once a payment is applied to it';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.tenant_id <> OLD.tenant_id OR NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'An opening balance can''t move to another tenant';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER opening_balances_guard
  BEFORE UPDATE OR DELETE ON public.opening_balances
  FOR EACH ROW EXECUTE FUNCTION app.guard_opening_balance();--> statement-breakpoint
-- Positive amounts go to a sent invoice or to an opening balance.
CREATE OR REPLACE FUNCTION app.check_payment_allocation() RETURNS trigger
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
    IF NEW.invoice_id IS NOT NULL AND NOT EXISTS (
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
$$;
