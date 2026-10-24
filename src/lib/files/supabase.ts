// The app's file store: Supabase Storage, as the signed-in user, so the
// storage policies on the `documents` bucket apply (drizzle/0020).

import { createSupabase } from "@/lib/supabase/server";
import type { FileStore } from "./store";

const BUCKET = "documents";

export async function supabaseStore(): Promise<FileStore> {
  const supabase = await createSupabase();
  const bucket = supabase.storage.from(BUCKET);
  return {
    async put(path, bytes, contentType) {
      const { error } = await bucket.upload(path, bytes, {
        contentType,
        upsert: false,
      });
      if (error) throw new Error(`Upload to ${path} failed: ${error.message}`);
    },
    async remove(path) {
      await bucket.remove([path]);
    },
    async get(path) {
      const { data, error } = await bucket.download(path);
      if (error || !data) return null;
      return {
        bytes: new Uint8Array(await data.arrayBuffer()),
        contentType: data.type || "application/octet-stream",
      };
    },
  };
}

/**
 * A one-time URL the browser PUTs a file to, as the signed-in user (the
 * bucket's upload policy still applies to the path).
 */
export async function signedUploadUrl(path: string): Promise<string> {
  const supabase = await createSupabase();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data)
    throw new Error(`Couldn't sign the upload: ${error?.message}`);
  return data.signedUrl;
}
