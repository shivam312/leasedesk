ALTER TABLE "units" ADD CONSTRAINT "units_organizationId_buildingId_id_unique" UNIQUE("organization_id","building_id","id");--> statement-breakpoint
CREATE TYPE "public"."area_basis" AS ENUM('carpet', 'chargeable');--> statement-breakpoint
CREATE TYPE "public"."lease_status" AS ENUM('draft', 'active', 'in_notice', 'expired', 'terminated', 'renewed');--> statement-breakpoint
CREATE TABLE "lease_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"area" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lease_units_leaseId_unitId_unique" UNIQUE("lease_id","unit_id"),
	CONSTRAINT "lease_units_area_positive" CHECK ("lease_units"."area" > 0)
);
--> statement-breakpoint
ALTER TABLE "lease_units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"status" "lease_status" DEFAULT 'draft' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"lock_in_end_date" date,
	"notice_period_months" integer,
	"rent_free_months" integer DEFAULT 0 NOT NULL,
	"rent_free_days" integer DEFAULT 0 NOT NULL,
	"rent_commencement_date" date NOT NULL,
	"area_basis" "area_basis" DEFAULT 'chargeable' NOT NULL,
	"deposit_amount" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"replaces_lease_id" uuid,
	"signed_document_id" uuid,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leases_organizationId_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "leases_organizationId_buildingId_id_unique" UNIQUE("organization_id","building_id","id"),
	CONSTRAINT "leases_end_after_start" CHECK ("leases"."end_date" >= "leases"."start_date"),
	CONSTRAINT "leases_rent_free_months_or_days" CHECK ("leases"."rent_free_months" >= 0 and "leases"."rent_free_days" >= 0 and ("leases"."rent_free_months" = 0 or "leases"."rent_free_days" = 0)),
	CONSTRAINT "leases_rent_starts_in_lease" CHECK ("leases"."rent_commencement_date" >= "leases"."start_date"),
	CONSTRAINT "leases_deposit_not_negative" CHECK ("leases"."deposit_amount" >= 0),
	CONSTRAINT "leases_version_positive" CHECK ("leases"."version" >= 1),
	CONSTRAINT "leases_notice_not_negative" CHECK ("leases"."notice_period_months" is null or "leases"."notice_period_months" >= 0)
);
--> statement-breakpoint
ALTER TABLE "leases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lease_units" ADD CONSTRAINT "lease_units_organization_id_building_id_lease_id_leases_organization_id_building_id_id_fk" FOREIGN KEY ("organization_id","building_id","lease_id") REFERENCES "public"."leases"("organization_id","building_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_units" ADD CONSTRAINT "lease_units_organization_id_building_id_unit_id_units_organization_id_building_id_id_fk" FOREIGN KEY ("organization_id","building_id","unit_id") REFERENCES "public"."units"("organization_id","building_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_organization_id_tenant_id_tenants_organization_id_id_fk" FOREIGN KEY ("organization_id","tenant_id") REFERENCES "public"."tenants"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_organization_id_building_id_buildings_organization_id_id_fk" FOREIGN KEY ("organization_id","building_id") REFERENCES "public"."buildings"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_organization_id_replaces_lease_id_leases_organization_id_id_fk" FOREIGN KEY ("organization_id","replaces_lease_id") REFERENCES "public"."leases"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lease_units_organization_id_index" ON "lease_units" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lease_units_lease_id_index" ON "lease_units" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "lease_units_unit_id_index" ON "lease_units" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "leases_organization_id_index" ON "leases" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "leases_tenant_id_index" ON "leases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "leases_building_id_index" ON "leases" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "leases_organization_id_status_index" ON "leases" USING btree ("organization_id","status");