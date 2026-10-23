CREATE TYPE "public"."document_kind" AS ENUM('agreement', 'addendum', 'tds_certificate', 'id_proof', 'insurance', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_owner" AS ENUM('lease', 'tenant', 'unit', 'building');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_type" "document_owner" NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_organizationId_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "documents_filePath_unique" UNIQUE("file_path"),
	CONSTRAINT "documents_path_in_org" CHECK ("documents"."file_path" like "documents"."organization_id"::text || '/%'),
	CONSTRAINT "documents_size" CHECK ("documents"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "documents_organization_id_index" ON "documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "documents_owner_type_owner_id_index" ON "documents" USING btree ("owner_type","owner_id");--> statement-breakpoint
ALTER TABLE "tds_records" ADD CONSTRAINT "tds_records_organization_id_certificate_document_id_documents_organization_id_id_fk" FOREIGN KEY ("organization_id","certificate_document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tds_records" ADD CONSTRAINT "tds_records_certificate" CHECK ("tds_records"."certificate_document_id" is null or "tds_records"."certificate_received");