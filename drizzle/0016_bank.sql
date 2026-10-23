CREATE TYPE "public"."match_status" AS ENUM('unmatched', 'suggested', 'matched', 'ignored');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"billing_entity_id" uuid NOT NULL,
	"bank_name" text NOT NULL,
	"account_last4" text NOT NULL,
	"column_mapping" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_organizationId_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "bank_accounts_billingEntityId_bankName_accountLast4_unique" UNIQUE("billing_entity_id","bank_name","account_last4"),
	CONSTRAINT "bank_accounts_last4" CHECK ("bank_accounts"."account_last4" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_statement_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"line_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"debit_count" integer DEFAULT 0 NOT NULL,
	"imported_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_imports_organizationId_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "bank_statement_imports_organizationId_bankAccountId_id_unique" UNIQUE("organization_id","bank_account_id","id")
);
--> statement-breakpoint
ALTER TABLE "bank_statement_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_statement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"credit_amount" bigint NOT NULL,
	"fingerprint" text NOT NULL,
	"match_status" "match_status" DEFAULT 'unmatched' NOT NULL,
	"suggested_tenant_id" uuid,
	"suggested_invoice_ids" uuid[],
	"confidence" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_lines_organizationId_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "bank_statement_lines_bankAccountId_fingerprint_unique" UNIQUE("bank_account_id","fingerprint"),
	CONSTRAINT "bank_statement_lines_credit" CHECK ("bank_statement_lines"."credit_amount" > 0),
	CONSTRAINT "bank_statement_lines_confidence" CHECK ("bank_statement_lines"."confidence" is null or "bank_statement_lines"."confidence" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organization_id_billing_entity_id_billing_entities_organization_id_id_fk" FOREIGN KEY ("organization_id","billing_entity_id") REFERENCES "public"."billing_entities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_organization_id_bank_account_id_bank_accounts_organization_id_id_fk" FOREIGN KEY ("organization_id","bank_account_id") REFERENCES "public"."bank_accounts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_organization_id_bank_account_id_import_id_bank_statement_imports_organization_id_bank_account_id_id_fk" FOREIGN KEY ("organization_id","bank_account_id","import_id") REFERENCES "public"."bank_statement_imports"("organization_id","bank_account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_organization_id_suggested_tenant_id_tenants_organization_id_id_fk" FOREIGN KEY ("organization_id","suggested_tenant_id") REFERENCES "public"."tenants"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_accounts_organization_id_index" ON "bank_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bank_statement_imports_organization_id_index" ON "bank_statement_imports" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bank_statement_imports_bank_account_id_index" ON "bank_statement_imports" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "bank_statement_lines_organization_id_match_status_index" ON "bank_statement_lines" USING btree ("organization_id","match_status");--> statement-breakpoint
CREATE INDEX "bank_statement_lines_import_id_index" ON "bank_statement_lines" USING btree ("import_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_bank_statement_line_id_bank_statement_lines_organization_id_id_fk" FOREIGN KEY ("organization_id","bank_statement_line_id") REFERENCES "public"."bank_statement_lines"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_per_bank_line" ON "payments" USING btree ("bank_statement_line_id") WHERE "payments"."kind" = 'payment' and "payments"."status" = 'active' and "payments"."bank_statement_line_id" is not null;