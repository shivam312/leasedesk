CREATE TYPE "public"."payment_kind" AS ENUM('payment', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('neft', 'rtgs', 'imps', 'upi', 'cheque', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('active', 'reversed');--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_settled" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_not_zero" CHECK ("payment_allocations"."amount_settled" <> 0)
);
--> statement-breakpoint
ALTER TABLE "payment_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "payment_kind" DEFAULT 'payment' NOT NULL,
	"received_date" date NOT NULL,
	"amount_received" bigint NOT NULL,
	"tds_deducted" bigint DEFAULT 0 NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"reference" text,
	"note" text,
	"bank_statement_line_id" uuid,
	"status" "payment_status" DEFAULT 'active' NOT NULL,
	"reverses_payment_id" uuid,
	"reversed_by_payment_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_organizationId_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "payments_organizationId_tenantId_id_unique" UNIQUE("organization_id","tenant_id","id"),
	CONSTRAINT "payments_reversesPaymentId_unique" UNIQUE("reverses_payment_id"),
	CONSTRAINT "payments_amounts" CHECK (("payments"."kind" = 'payment' and "payments"."amount_received" > 0 and "payments"."tds_deducted" >= 0 and "payments"."reverses_payment_id" is null)
        or ("payments"."kind" = 'reversal' and "payments"."amount_received" < 0 and "payments"."tds_deducted" <= 0 and "payments"."reverses_payment_id" is not null and "payments"."status" = 'active')),
	CONSTRAINT "payments_reversed" CHECK (("payments"."status" = 'reversed') = ("payments"."reversed_by_payment_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tds_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"financial_year" text NOT NULL,
	"quarter" integer NOT NULL,
	"certificate_received" boolean DEFAULT false NOT NULL,
	"certificate_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tds_records_amount_positive" CHECK ("tds_records"."amount" > 0),
	CONSTRAINT "tds_records_quarter" CHECK ("tds_records"."quarter" between 1 and 4),
	CONSTRAINT "tds_records_financial_year" CHECK ("tds_records"."financial_year" ~ '^[0-9]{4}-[0-9]{2}$')
);
--> statement-breakpoint
ALTER TABLE "tds_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_tenantId_id_unique" UNIQUE("organization_id","tenant_id","id");--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_tenant_id_payment_id_payments_organization_id_tenant_id_id_fk" FOREIGN KEY ("organization_id","tenant_id","payment_id") REFERENCES "public"."payments"("organization_id","tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_tenant_id_invoice_id_invoices_organization_id_tenant_id_id_fk" FOREIGN KEY ("organization_id","tenant_id","invoice_id") REFERENCES "public"."invoices"("organization_id","tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_tenant_id_tenants_organization_id_id_fk" FOREIGN KEY ("organization_id","tenant_id") REFERENCES "public"."tenants"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_tenant_id_reverses_payment_id_payments_organization_id_tenant_id_id_fk" FOREIGN KEY ("organization_id","tenant_id","reverses_payment_id") REFERENCES "public"."payments"("organization_id","tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_tenant_id_reversed_by_payment_id_payments_organization_id_tenant_id_id_fk" FOREIGN KEY ("organization_id","tenant_id","reversed_by_payment_id") REFERENCES "public"."payments"("organization_id","tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tds_records" ADD CONSTRAINT "tds_records_organization_id_tenant_id_payment_id_payments_organization_id_tenant_id_id_fk" FOREIGN KEY ("organization_id","tenant_id","payment_id") REFERENCES "public"."payments"("organization_id","tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tds_records" ADD CONSTRAINT "tds_records_organization_id_tenant_id_invoice_id_invoices_organization_id_tenant_id_id_fk" FOREIGN KEY ("organization_id","tenant_id","invoice_id") REFERENCES "public"."invoices"("organization_id","tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_allocations_organization_id_index" ON "payment_allocations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_id_index" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_id_index" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_organization_id_index" ON "payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payments_tenant_id_index" ON "payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tds_records_organization_id_index" ON "tds_records" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tds_records_tenant_id_financial_year_quarter_index" ON "tds_records" USING btree ("tenant_id","financial_year","quarter");--> statement-breakpoint
CREATE INDEX "tds_records_payment_id_index" ON "tds_records" USING btree ("payment_id");