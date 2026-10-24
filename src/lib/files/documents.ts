// Documents kept on a lease or a tenant: the signed agreement, addenda, ID
// proof, insurance. The file goes to the `documents` bucket under the
// organization's folder; the row says what it is and whose (docs/DATA_MODEL.md).

import { and, desc, eq } from "drizzle-orm";
import { insertLogged } from "@/lib/db/activity-log";
import { documents, leases, tenants } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import {
  CERTIFICATE_TYPES,
  MAX_UPLOAD_BYTES,
  sizeInMb,
  sniffType,
  type FileStore,
} from "./store";

export type DocumentOwner = "lease" | "tenant";
export type DocumentKind =
  "agreement" | "addendum" | "id_proof" | "insurance" | "other";

/** The kinds a person uploads, in the glossary's words. */
export const DOCUMENT_KINDS: Record<DocumentKind, string> = {
  agreement: "Signed agreement",
  addendum: "Addendum",
  id_proof: "ID proof",
  insurance: "Insurance",
  other: "Other",
};

/** An upload that isn't allowed, with a message to show as it is. */
export class DocumentError extends Error {}

const tooBig = (bytes: number, max: number) =>
  `That file is ${sizeInMb(bytes)}; the most is ${sizeInMb(max)}. Upload a smaller scan, or a PDF.`;

async function checkOwner(
  s: Scoped,
  ownerType: DocumentOwner,
  ownerId: string,
) {
  const table = ownerType === "lease" ? leases : tenants;
  const [owner] = await s.tx
    .select({ id: table.id })
    .from(table)
    .where(s.where(table, eq(table.id, ownerId)));
  if (!owner) throw new DocumentError(`That ${ownerType} couldn't be found.`);
}

const folderOf = (s: Scoped, ownerType: DocumentOwner, ownerId: string) =>
  `${s.organizationId}/${ownerType}s/${ownerId}/`;

export async function attachDocument(
  s: Scoped,
  store: FileStore,
  input: {
    ownerType: DocumentOwner;
    ownerId: string;
    kind: DocumentKind;
    fileName: string;
    bytes: Uint8Array;
  },
  maxBytes = MAX_UPLOAD_BYTES,
) {
  if (input.bytes.length === 0) throw new DocumentError("That file is empty.");
  if (input.bytes.length > maxBytes)
    throw new DocumentError(tooBig(input.bytes.length, maxBytes));
  // What the file really is, from its first bytes, not what the browser says.
  const contentType = sniffType(input.bytes);
  const ext = contentType ? CERTIFICATE_TYPES[contentType] : undefined;
  if (!contentType || !ext)
    throw new DocumentError("Upload a PDF, PNG or JPG file.");
  await checkOwner(s, input.ownerType, input.ownerId);
  const path = `${folderOf(s, input.ownerType, input.ownerId)}${crypto.randomUUID()}.${ext}`;
  await store.put(path, input.bytes, contentType);
  return insertLogged(s, documents, {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    kind: input.kind,
    filePath: path,
    fileName: input.fileName.slice(0, 200) || `document.${ext}`,
    contentType,
    sizeBytes: input.bytes.length,
    uploadedBy: s.userId,
  });
}

/** A lease's or tenant's documents, newest first (TDS certificates are on the TDS tracker). */
export async function documentsFor(
  s: Scoped,
  ownerType: DocumentOwner,
  ownerId: string,
) {
  const rows = await s.tx
    .select()
    .from(documents)
    .where(
      s.where(
        documents,
        and(eq(documents.ownerType, ownerType), eq(documents.ownerId, ownerId)),
      ),
    )
    .orderBy(desc(documents.createdAt));
  return rows.filter((d) => d.kind !== "tds_certificate");
}

/**
 * Before a browser upload: check the size the browser reports and the
 * owner, and choose the file's path in the owner's folder.
 */
export async function planUpload(
  s: Scoped,
  input: { ownerType: DocumentOwner; ownerId: string; size: number },
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<string> {
  if (input.size <= 0) throw new DocumentError("That file is empty.");
  if (input.size > maxBytes)
    throw new DocumentError(tooBig(input.size, maxBytes));
  await checkOwner(s, input.ownerType, input.ownerId);
  return `${folderOf(s, input.ownerType, input.ownerId)}${crypto.randomUUID()}`;
}

/**
 * After a browser upload: check the stored file itself (type from its first
 * bytes, and size), then record it, logged. A file that fails is deleted.
 */
export async function recordUpload(
  s: Scoped,
  store: FileStore,
  input: {
    ownerType: DocumentOwner;
    ownerId: string;
    kind: DocumentKind;
    fileName: string;
    path: string;
  },
  maxBytes = MAX_UPLOAD_BYTES,
) {
  const folder = folderOf(s, input.ownerType, input.ownerId);
  // Only a path planUpload could have chosen: this owner's folder, one level.
  if (
    !input.path.startsWith(folder) ||
    !/^[0-9a-f-]{36}$/.test(input.path.slice(folder.length))
  )
    throw new DocumentError("That upload couldn't be found. Try again.");
  await checkOwner(s, input.ownerType, input.ownerId);
  const file = await store.get(input.path);
  if (!file)
    throw new DocumentError("That upload couldn't be found. Try again.");
  const contentType = sniffType(file.bytes);
  const problem =
    file.bytes.length === 0
      ? "That file is empty."
      : file.bytes.length > maxBytes
        ? tooBig(file.bytes.length, maxBytes)
        : !contentType
          ? "Upload a PDF, PNG or JPG file."
          : null;
  if (problem) {
    await store.remove(input.path);
    throw new DocumentError(problem);
  }
  return insertLogged(s, documents, {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    kind: input.kind,
    filePath: input.path,
    fileName: input.fileName.slice(0, 200) || "document",
    contentType: contentType!,
    sizeBytes: file.bytes.length,
    uploadedBy: s.userId,
  });
}
