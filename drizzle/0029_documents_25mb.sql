-- Documents upload straight from the browser to Storage (signed upload
-- URLs), not through a server action, so the bucket takes files up to 25 MB
-- (was 10 MB; drizzle/0020). The app checks each file's type and size again
-- before recording it.
UPDATE storage.buckets SET file_size_limit = 26214400 WHERE id = 'documents';
