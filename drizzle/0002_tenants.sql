CREATE TYPE "public"."contact_role" AS ENUM('billing', 'admin', 'legal', 'other');--> statement-breakpoint
CREATE TABLE "tenant_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" "contact_role" DEFAULT 'billing' NOT NULL,
	"email" text,
	"phone" text,
	"whatsapp" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"gstin" text,
	"pan" text,
	"billing_address" text NOT NULL,
	"state_code" text NOT NULL,
	"deducts_tds_rent" boolean DEFAULT true NOT NULL,
	"tds_rate_bp_rent" integer DEFAULT 1000 NOT NULL,
	"deducts_tds_cam" boolean DEFAULT true NOT NULL,
	"tds_rate_bp_cam" integer DEFAULT 1000 NOT NULL,
	"deducts_tds_parking" boolean DEFAULT true NOT NULL,
	"tds_rate_bp_parking" integer DEFAULT 1000 NOT NULL,
	"deducts_tds_other" boolean DEFAULT true NOT NULL,
	"tds_rate_bp_other" integer DEFAULT 1000 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_organizationId_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_contacts" ADD CONSTRAINT "tenant_contacts_organization_id_tenant_id_tenants_organization_id_id_fk" FOREIGN KEY ("organization_id","tenant_id") REFERENCES "public"."tenants"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_contacts_organization_id_index" ON "tenant_contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenant_contacts_tenant_id_index" ON "tenant_contacts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_contacts_one_primary" ON "tenant_contacts" USING btree ("tenant_id") WHERE "tenant_contacts"."is_primary";--> statement-breakpoint
CREATE INDEX "tenants_organization_id_index" ON "tenants" USING btree ("organization_id");