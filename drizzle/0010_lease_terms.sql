CREATE TYPE "public"."charge_basis" AS ENUM('fixed', 'per_sqft', 'per_slot');--> statement-breakpoint
CREATE TYPE "public"."charge_frequency" AS ENUM('monthly', 'quarterly');--> statement-breakpoint
CREATE TYPE "public"."charge_timing" AS ENUM('advance', 'arrears');--> statement-breakpoint
CREATE TYPE "public"."charge_type" AS ENUM('rent', 'cam', 'parking', 'utilities', 'signage', 'other');--> statement-breakpoint
CREATE TYPE "public"."critical_date_status" AS ENUM('open', 'done', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."critical_date_type" AS ENUM('expiry', 'lock_in_end', 'escalation', 'renewal_option', 'notice_deadline', 'custom');--> statement-breakpoint
CREATE TYPE "public"."escalation_anchor" AS ENUM('lease_start', 'rent_commencement', 'custom');--> statement-breakpoint
CREATE TABLE "critical_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"type" "critical_date_type" NOT NULL,
	"date" date NOT NULL,
	"remind_days" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"assigned_to" uuid,
	"status" "critical_date_status" DEFAULT 'open' NOT NULL,
	"snoozed_until" date,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "critical_dates_snoozed_until" CHECK (("critical_dates"."status" = 'snoozed') = ("critical_dates"."snoozed_until" is not null)),
	CONSTRAINT "critical_dates_custom_label" CHECK ("critical_dates"."type" <> 'custom' or "critical_dates"."label" is not null)
);
--> statement-breakpoint
ALTER TABLE "critical_dates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "custom_escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"effective_date" date NOT NULL,
	"new_amount" bigint,
	"percent_bp" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_escalations_chargeId_effectiveDate_unique" UNIQUE("charge_id","effective_date"),
	CONSTRAINT "custom_escalations_amount_or_percent" CHECK (("custom_escalations"."new_amount" is null) <> ("custom_escalations"."percent_bp" is null) and ("custom_escalations"."new_amount" is null or "custom_escalations"."new_amount" >= 0))
);
--> statement-breakpoint
ALTER TABLE "custom_escalations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "escalation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"charge_ids" uuid[],
	"percent_bp" integer NOT NULL,
	"every_months" integer NOT NULL,
	"anchor" "escalation_anchor" DEFAULT 'lease_start' NOT NULL,
	"anchor_date" date,
	"compounding" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escalation_rules_percent_positive" CHECK ("escalation_rules"."percent_bp" > 0),
	CONSTRAINT "escalation_rules_every_positive" CHECK ("escalation_rules"."every_months" > 0),
	CONSTRAINT "escalation_rules_anchor_date" CHECK (("escalation_rules"."anchor" = 'custom') = ("escalation_rules"."anchor_date" is not null))
);
--> statement-breakpoint
ALTER TABLE "escalation_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lease_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"type" charge_type NOT NULL,
	"basis" charge_basis NOT NULL,
	"rate_or_amount" bigint NOT NULL,
	"quantity" integer,
	"start_date" date NOT NULL,
	"end_date" date,
	"frequency" charge_frequency DEFAULT 'monthly' NOT NULL,
	"timing" charge_timing NOT NULL,
	"gst_rate_bp" integer NOT NULL,
	"sac_code" text NOT NULL,
	"waived_during_rent_free" boolean NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lease_charges_organizationId_leaseId_id_unique" UNIQUE("organization_id","lease_id","id"),
	CONSTRAINT "lease_charges_amount_not_negative" CHECK ("lease_charges"."rate_or_amount" >= 0),
	CONSTRAINT "lease_charges_slots_only_per_slot" CHECK (("lease_charges"."basis" = 'per_slot') = ("lease_charges"."quantity" is not null) and ("lease_charges"."quantity" is null or "lease_charges"."quantity" > 0)),
	CONSTRAINT "lease_charges_end_after_start" CHECK ("lease_charges"."end_date" is null or "lease_charges"."end_date" >= "lease_charges"."start_date"),
	CONSTRAINT "lease_charges_gst_rate" CHECK ("lease_charges"."gst_rate_bp" >= 0 and "lease_charges"."gst_rate_bp" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "lease_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "critical_dates" ADD CONSTRAINT "critical_dates_organization_id_lease_id_leases_organization_id_id_fk" FOREIGN KEY ("organization_id","lease_id") REFERENCES "public"."leases"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_escalations" ADD CONSTRAINT "custom_escalations_organization_id_lease_id_charge_id_lease_charges_organization_id_lease_id_id_fk" FOREIGN KEY ("organization_id","lease_id","charge_id") REFERENCES "public"."lease_charges"("organization_id","lease_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_organization_id_lease_id_leases_organization_id_id_fk" FOREIGN KEY ("organization_id","lease_id") REFERENCES "public"."leases"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_charges" ADD CONSTRAINT "lease_charges_organization_id_lease_id_leases_organization_id_id_fk" FOREIGN KEY ("organization_id","lease_id") REFERENCES "public"."leases"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "critical_dates_organization_id_index" ON "critical_dates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "critical_dates_lease_id_index" ON "critical_dates" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "critical_dates_organization_id_status_date_index" ON "critical_dates" USING btree ("organization_id","status","date");--> statement-breakpoint
CREATE INDEX "custom_escalations_organization_id_index" ON "custom_escalations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "custom_escalations_lease_id_index" ON "custom_escalations" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "escalation_rules_organization_id_index" ON "escalation_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "escalation_rules_lease_id_index" ON "escalation_rules" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "lease_charges_organization_id_index" ON "lease_charges" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lease_charges_lease_id_index" ON "lease_charges" USING btree ("lease_id");