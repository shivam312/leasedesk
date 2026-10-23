CREATE TYPE "public"."digest_status" AS ENUM('sending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "digest_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"digest_date" date NOT NULL,
	"sent_to" text NOT NULL,
	"item_count" integer NOT NULL,
	"status" "digest_status" DEFAULT 'sending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_sends_items" CHECK ("digest_sends"."item_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "digest_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "digest_sends" ADD CONSTRAINT "digest_sends_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "digest_sends_organization_id_index" ON "digest_sends" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "digest_sends_one_per_day" ON "digest_sends" USING btree ("organization_id","user_id","digest_date");