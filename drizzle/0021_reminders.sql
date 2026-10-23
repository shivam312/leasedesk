CREATE TYPE "public"."reminder_channel" AS ENUM('email', 'whatsapp_link');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('sending', 'sent', 'failed', 'no_email');--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"channel" "reminder_channel" NOT NULL,
	"step" text,
	"amount_asked" bigint NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_by" uuid,
	"sent_to" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "reminder_status" DEFAULT 'sending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_amount" CHECK ("reminders"."amount_asked" > 0),
	CONSTRAINT "reminders_step" CHECK ("reminders"."step" is null or "reminders"."step" ~ '^(before|after):[0-9]+$'),
	CONSTRAINT "reminders_automatic" CHECK ("reminders"."step" is null or "reminders"."sent_by" is null)
);
--> statement-breakpoint
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_organization_id_invoice_id_invoices_organization_id_id_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_organization_id_index" ON "reminders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reminders_invoice_id_index" ON "reminders" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_one_per_step" ON "reminders" USING btree ("invoice_id","channel","step") WHERE "reminders"."step" is not null;