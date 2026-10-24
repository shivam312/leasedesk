// Where uploaded files live, behind a small interface (docs/AUTONOMY.md,
// "External services"): Supabase Storage's private `documents` bucket in the
// app, a map in memory for tests. Paths start with the organization id;
// storage policies (drizzle/0020) keep each organization in its folder.

export interface FileStore {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(path: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  /** Delete a file that turned out not to be allowed (an upload that failed its checks). */
  remove(path: string): Promise<void>;
}

/** For tests: files kept in memory. */
export function memoryStore(): FileStore & {
  files: Map<string, { bytes: Uint8Array; contentType: string }>;
} {
  const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    files,
    async put(path, bytes, contentType) {
      if (files.has(path)) throw new Error(`${path} already exists`);
      files.set(path, { bytes, contentType });
    },
    async get(path) {
      return files.get(path) ?? null;
    },
    async remove(path) {
      files.delete(path);
    },
  };
}

/** The kinds of file a certificate can be, with their extension. */
export const CERTIFICATE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

/**
 * Documents go straight from the browser to Storage (signed upload URLs),
 * so they can be up to 25 MB (the bucket's limit, drizzle/0029).
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Files sent through a server action (TDS certificates) must fit its 4 MB body limit (next.config.ts). */
export const MAX_ACTION_UPLOAD_BYTES = 3 * 1024 * 1024;

/** "31 MB", "0.5 MB": a file size in words for an error. */
export function sizeInMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

/** The file type its first bytes show, if it's one we accept. */
export function sniffType(bytes: Uint8Array): string | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (starts([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

/**
 * A Content-Disposition header for any file name: an ASCII fallback, and
 * the real name encoded for browsers that read it (RFC 6266). Headers
 * can't carry characters like "–" or Hindi letters as they are.
 */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
