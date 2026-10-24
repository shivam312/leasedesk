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

const MB = (bytes: number) => Math.round(bytes / (1024 * 1024));

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
    throw new DocumentError(
      `That file is over ${MB(maxBytes)} MB. Upload a smaller scan, or a PDF.`,
    );
  // What the file really is, from its first bytes, not what the browser says.
  const contentType = sniffType(input.bytes);
  const ext = contentType ? CERTIFICATE_TYPES[contentType] : undefined;
  if (!contentType || !ext)
    throw new DocumentError("Upload a PDF, PNG or JPG file.");
  const table = input.ownerType === "lease" ? leases : tenants;
  const [owner] = await s.tx
    .select({ id: table.id })
    .from(table)
    .where(s.where(table, eq(table.id, input.ownerId)));
  if (!owner)
    throw new DocumentError(`That ${input.ownerType} couldn't be found.`);
  const path = `${s.organizationId}/${input.ownerType}s/${input.ownerId}/${crypto.randomUUID()}.${ext}`;
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
