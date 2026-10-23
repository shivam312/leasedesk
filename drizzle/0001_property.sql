-- Moved first by hand: the composite foreign keys below need this unique constraint.
ALTER TABLE "billing_entities" ADD CONSTRAINT "billing_entities_organizationId_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('vacant', 'leased', 'fit_out', 'blocked');--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"state_code" text NOT NULL,
	"billing_entity_id" uuid NOT NULL,
	"invoice_prefix" text NOT NULL,
	"credit_note_prefix" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buildings_organizationId_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "buildings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "floors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floors_buildingId_label_unique" UNIQUE("building_id","label"),
	CONSTRAINT "floors_organizationId_buildingId_id_unique" UNIQUE("organization_id","building_id","id")
);
--> statement-breakpoint
ALTER TABLE "floors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"floor_id" uuid,
	"code" text NOT NULL,
	"carpet_area" integer NOT NULL,
	"chargeable_area" integer NOT NULL,
	"status" "unit_status" DEFAULT 'vacant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_buildingId_code_unique" UNIQUE("building_id","code"),
	CONSTRAINT "units_organizationId_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_organization_id_billing_entity_id_billing_entities_organization_id_id_fk" FOREIGN KEY ("organization_id","billing_entity_id") REFERENCES "public"."billing_entities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_organization_id_building_id_buildings_organization_id_id_fk" FOREIGN KEY ("organization_id","building_id") REFERENCES "public"."buildings"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_building_id_buildings_organization_id_id_fk" FOREIGN KEY ("organization_id","building_id") REFERENCES "public"."buildings"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_building_id_floor_id_floors_organization_id_building_id_id_fk" FOREIGN KEY ("organization_id","building_id","floor_id") REFERENCES "public"."floors"("organization_id","building_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buildings_organization_id_index" ON "buildings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "floors_organization_id_index" ON "floors" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "floors_building_id_index" ON "floors" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "units_organization_id_index" ON "units" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "units_building_id_index" ON "units" USING btree ("building_id");