CREATE TYPE "public"."deposit_entry_kind" AS ENUM('received', 'refunded', 'adjusted', 'forfeited');--> statement-breakpoint
CREATE TABLE "deposit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "deposit_entry_kind" NOT NULL,
	"date" date NOT NULL,
	"amount" bigint NOT NULL,
	"reference" text,
	"note" text,
	"payment_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposit_entries_amount_positive" CHECK ("deposit_entries"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "deposit_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deposit_entries" ADD CONSTRAINT "deposit_entries_organization_id_tenant_id_tenants_organization_id_id_fk" FOREIGN KEY ("organization_id","tenant_id") REFERENCES "public"."tenants"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_entries" ADD CONSTRAINT "deposit_entries_organization_id_payment_id_payments_organization_id_id_fk" FOREIGN KEY ("organization_id","payment_id") REFERENCES "public"."payments"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deposit_entries_organization_id_lease_id_index" ON "deposit_entries" USING btree ("organization_id","lease_id");--> statement-breakpoint
-- The lease it belongs to, in the same organization (leases is in another
-- schema file, so the key is written here).
ALTER TABLE "deposit_entries" ADD CONSTRAINT "deposit_entries_lease_fk" FOREIGN KEY ("organization_id","lease_id") REFERENCES "public"."leases"("organization_id","id") ON DELETE restrict;--> statement-breakpoint
-- Members read; owners and accounts record; nobody changes or deletes an
-- entry (money is corrected by a new entry, never edited).
SELECT app.apply_org_policies('deposit_entries', '{owner,accounts}', '{}');--> statement-breakpoint
CREATE FUNCTION app.guard_deposit_entry() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A deposit entry can''t be changed or deleted';
END;
$$;--> statement-breakpoint
CREATE TRIGGER deposit_entries_guard
  BEFORE UPDATE OR DELETE ON public.deposit_entries
  FOR EACH ROW EXECUTE FUNCTION app.guard_deposit_entry();
