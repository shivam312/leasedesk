CREATE TYPE "public"."job_name" AS ENUM('billing', 'reminders', 'digest');--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job" "job_name" NOT NULL,
	"run_date" date NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"source" text DEFAULT 'schedule' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_runs_organization_id_job_run_date_index" ON "job_runs" USING btree ("organization_id","job","run_date");--> statement-breakpoint
-- Members read their organization's job runs; only the daily jobs (as the
-- database owner, D22) write them.
SELECT app.apply_org_policies('job_runs', '{}', '{}');
