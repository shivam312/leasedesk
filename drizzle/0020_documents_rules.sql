-- Documents: members read; owners, accounts and property managers upload
-- (each screen's action checks its own permission too); only owners delete.
SELECT app.apply_org_policies('documents', '{owner,accounts,property_manager}', '{owner}');--> statement-breakpoint

-- The files: a private bucket, one folder per organization. A member reads
-- their organization's folder; the same roles upload into it. Nobody
-- overwrites or deletes through the API (a new upload gets a new path).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 10485760, '{application/pdf,image/png,image/jpeg}')
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint
CREATE POLICY documents_members_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND app.is_member(((storage.foldername(name))[1])::uuid)
  );--> statement-breakpoint
CREATE POLICY documents_roles_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND app.has_role(((storage.foldername(name))[1])::uuid, '{owner,accounts,property_manager}')
  );
