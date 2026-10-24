ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_organizationId_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "invoice_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "opening_balance_id" uuid;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_organization_id_opening_balance_id_opening_balances_organization_id_id_fk" FOREIGN KEY ("organization_id","opening_balance_id") REFERENCES "public"."opening_balances"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_opening_balance_id_index" ON "reminders" USING btree ("opening_balance_id");--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_one_target" CHECK (("reminders"."invoice_id" is null) <> ("reminders"."opening_balance_id" is null));--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_opening_by_hand" CHECK ("reminders"."opening_balance_id" is null or "reminders"."step" is null);--> statement-breakpoint
-- A reminder is for a sent invoice or for a tenant's opening balance
-- (D-028); otherwise as in drizzle/0022.
CREATE OR REPLACE FUNCTION app.guard_reminder() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A reminder can''t be deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.invoice_id IS NOT NULL AND NOT EXISTS (
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
$$;
