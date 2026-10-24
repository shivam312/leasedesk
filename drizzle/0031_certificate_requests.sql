CREATE TABLE "certificate_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"financial_year" text NOT NULL,
	"quarter" integer NOT NULL,
	"sent_to" text[] NOT NULL,
	"status" text NOT NULL,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "certificate_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "certificate_requests" ADD CONSTRAINT "certificate_requests_organization_id_tenant_id_tenants_organization_id_id_fk" FOREIGN KEY ("organization_id","tenant_id") REFERENCES "public"."tenants"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certificate_requests_organization_id_financial_year_index" ON "certificate_requests" USING btree ("organization_id","financial_year");--> statement-breakpoint
-- Members read; owners and accounts record a request; nobody deletes.
SELECT app.apply_org_policies('certificate_requests', '{owner,accounts}', '{}');
