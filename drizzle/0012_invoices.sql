CREATE TYPE "public"."credit_note_reason" AS ENUM('correction', 'waiver', 'discount', 'other');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'part_paid', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."series_kind" AS ENUM('invoice', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."supply_kind" AS ENUM('intra_state', 'inter_state');--> statement-breakpoint
CREATE TABLE "credit_note_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"credit_note_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"invoice_line_id" uuid NOT NULL,
	"description" text NOT NULL,
	"taxable_amount" bigint NOT NULL,
	"gst_rate_bp" integer NOT NULL,
	"cgst" bigint NOT NULL,
	"sgst" bigint NOT NULL,
	"igst" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_note_lines_amounts_not_negative" CHECK ("credit_note_lines"."taxable_amount" >= 0 and "credit_note_lines"."cgst" >= 0 and "credit_note_lines"."sgst" >= 0 and "credit_note_lines"."igst" >= 0)
);
--> statement-breakpoint
ALTER TABLE "credit_note_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"number" text NOT NULL,
	"date" date NOT NULL,
	"reason" "credit_note_reason" NOT NULL,
	"note" text,
	"supply_type" "supply_kind" NOT NULL,
	"taxable_amount" bigint NOT NULL,
	"cgst" bigint NOT NULL,
	"sgst" bigint NOT NULL,
	"igst" bigint NOT NULL,
	"round_off" bigint DEFAULT 0 NOT NULL,
	"total" bigint NOT NULL,
	"pdf_path" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_seriesId_number_unique" UNIQUE("series_id","number"),
	CONSTRAINT "credit_notes_organizationId_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "credit_notes_organizationId_invoiceId_id_unique" UNIQUE("organization_id","invoice_id","id"),
	CONSTRAINT "credit_notes_total_adds_up" CHECK ("credit_notes"."total" = "credit_notes"."taxable_amount" + "credit_notes"."cgst" + "credit_notes"."sgst" + "credit_notes"."igst" + "credit_notes"."round_off"),
	CONSTRAINT "credit_notes_amounts_not_negative" CHECK ("credit_notes"."taxable_amount" >= 0 and "credit_notes"."cgst" >= 0 and "credit_notes"."sgst" >= 0 and "credit_notes"."igst" >= 0 and "credit_notes"."total" > 0)
);
--> statement-breakpoint
ALTER TABLE "credit_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"charge_type" charge_type NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"quantity_label" text,
	"sac_code" text NOT NULL,
	"taxable_amount" bigint NOT NULL,
	"gst_rate_bp" integer NOT NULL,
	"cgst" bigint NOT NULL,
	"sgst" bigint NOT NULL,
	"igst" bigint NOT NULL,
	"explanation" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_lines_invoiceId_position_unique" UNIQUE("invoice_id","position"),
	CONSTRAINT "invoice_lines_organizationId_invoiceId_id_unique" UNIQUE("organization_id","invoice_id","id"),
	CONSTRAINT "invoice_lines_period" CHECK ("invoice_lines"."period_end" >= "invoice_lines"."period_start"),
	CONSTRAINT "invoice_lines_amounts_not_negative" CHECK ("invoice_lines"."taxable_amount" >= 0 and "invoice_lines"."cgst" >= 0 and "invoice_lines"."sgst" >= 0 and "invoice_lines"."igst" >= 0),
	CONSTRAINT "invoice_lines_gst_rate" CHECK ("invoice_lines"."gst_rate_bp" >= 0 and "invoice_lines"."gst_rate_bp" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"billing_entity_id" uuid NOT NULL,
	"kind" "series_kind" NOT NULL,
	"financial_year" text NOT NULL,
	"prefix" text NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_series_billingEntityId_kind_financialYear_prefix_unique" UNIQUE("billing_entity_id","kind","financial_year","prefix"),
	CONSTRAINT "invoice_series_organizationId_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "invoice_series_next_positive" CHECK ("invoice_series"."next_number" >= 1),
	CONSTRAINT "invoice_series_financial_year" CHECK ("invoice_series"."financial_year" ~ '^[0-9]{2}-[0-9]{2}$')
);
--> statement-breakpoint
ALTER TABLE "invoice_series" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"billing_entity_id" uuid NOT NULL,
	"run_month" date NOT NULL,
	"series_id" uuid,
	"number" text,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"place_of_supply" text NOT NULL,
	"supply_type" "supply_kind" NOT NULL,
	"taxable_total" bigint NOT NULL,
	"cgst_total" bigint NOT NULL,
	"sgst_total" bigint NOT NULL,
	"igst_total" bigint NOT NULL,
	"round_off" bigint DEFAULT 0 NOT NULL,
	"grand_total" bigint NOT NULL,
	"expected_tds" bigint DEFAULT 0 NOT NULL,
	"supplier" jsonb,
	"recipient" jsonb,
	"pdf_path" text,
	"sent_at" timestamp with time zone,
	"sent_to" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_organizationId_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "invoices_organizationId_leaseId_id_unique" UNIQUE("organization_id","lease_id","id"),
	CONSTRAINT "invoices_seriesId_number_unique" UNIQUE("series_id","number"),
	CONSTRAINT "invoices_period" CHECK ("invoices"."period_end" >= "invoices"."period_start" and "invoices"."due_date" >= "invoices"."invoice_date"),
	CONSTRAINT "invoices_run_month_first_day" CHECK (extract(day from "invoices"."run_month") = 1),
	CONSTRAINT "invoices_numbered_when_sent" CHECK (("invoices"."status" = 'draft') = ("invoices"."number" is null)
        and ("invoices"."number" is null) = ("invoices"."series_id" is null)
        and ("invoices"."status" = 'draft' or ("invoices"."supplier" is not null and "invoices"."recipient" is not null and "invoices"."sent_at" is not null))),
	CONSTRAINT "invoices_totals_add_up" CHECK ("invoices"."grand_total" = "invoices"."taxable_total" + "invoices"."cgst_total" + "invoices"."sgst_total" + "invoices"."igst_total" + "invoices"."round_off"),
	CONSTRAINT "invoices_amounts_not_negative" CHECK ("invoices"."taxable_total" >= 0 and "invoices"."cgst_total" >= 0 and "invoices"."sgst_total" >= 0 and "invoices"."igst_total" >= 0 and "invoices"."expected_tds" >= 0 and "invoices"."grand_total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_organization_id_invoice_id_credit_note_id_credit_notes_organization_id_invoice_id_id_fk" FOREIGN KEY ("organization_id","invoice_id","credit_note_id") REFERENCES "public"."credit_notes"("organization_id","invoice_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_organization_id_invoice_id_invoice_line_id_invoice_lines_organization_id_invoice_id_id_fk" FOREIGN KEY ("organization_id","invoice_id","invoice_line_id") REFERENCES "public"."invoice_lines"("organization_id","invoice_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_organization_id_invoice_id_invoices_organization_id_id_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_organization_id_series_id_invoice_series_organization_id_id_fk" FOREIGN KEY ("organization_id","series_id") REFERENCES "public"."invoice_series"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_organization_id_lease_id_invoice_id_invoices_organization_id_lease_id_id_fk" FOREIGN KEY ("organization_id","lease_id","invoice_id") REFERENCES "public"."invoices"("organization_id","lease_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_organization_id_lease_id_charge_id_lease_charges_organization_id_lease_id_id_fk" FOREIGN KEY ("organization_id","lease_id","charge_id") REFERENCES "public"."lease_charges"("organization_id","lease_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_series" ADD CONSTRAINT "invoice_series_organization_id_billing_entity_id_billing_entities_organization_id_id_fk" FOREIGN KEY ("organization_id","billing_entity_id") REFERENCES "public"."billing_entities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_tenant_id_tenants_organization_id_id_fk" FOREIGN KEY ("organization_id","tenant_id") REFERENCES "public"."tenants"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_lease_id_leases_organization_id_id_fk" FOREIGN KEY ("organization_id","lease_id") REFERENCES "public"."leases"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_building_id_buildings_organization_id_id_fk" FOREIGN KEY ("organization_id","building_id") REFERENCES "public"."buildings"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_billing_entity_id_billing_entities_organization_id_id_fk" FOREIGN KEY ("organization_id","billing_entity_id") REFERENCES "public"."billing_entities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_series_id_invoice_series_organization_id_id_fk" FOREIGN KEY ("organization_id","series_id") REFERENCES "public"."invoice_series"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_note_lines_organization_id_index" ON "credit_note_lines" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "credit_note_lines_credit_note_id_index" ON "credit_note_lines" USING btree ("credit_note_id");--> statement-breakpoint
CREATE INDEX "credit_note_lines_invoice_line_id_index" ON "credit_note_lines" USING btree ("invoice_line_id");--> statement-breakpoint
CREATE INDEX "credit_notes_organization_id_index" ON "credit_notes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_id_index" ON "credit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_organization_id_index" ON "invoice_lines" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_id_index" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_series_organization_id_index" ON "invoice_series" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invoices_organization_id_index" ON "invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invoices_organization_id_status_index" ON "invoices" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "invoices_tenant_id_index" ON "invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "invoices_lease_id_index" ON "invoices" USING btree ("lease_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_one_per_lease_per_run" ON "invoices" USING btree ("lease_id","run_month") WHERE "invoices"."status" <> 'cancelled';