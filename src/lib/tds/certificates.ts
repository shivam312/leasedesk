// TDS records for the tracker, and attaching a tenant's TDS certificate to a
// quarter: the file goes to the file store, a `documents` row says what it
// is, and every TDS record of that tenant and quarter (active payments only)
// is marked received with it. Only the certificate columns of a TDS record
// ever change (drizzle/0015).

import { and, eq } from "drizzle-orm";
import { insertLogged, updateLogged } from "@/lib/db/activity-log";
import { documents, payments, tdsRecords, tenants } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { TAX_LABELS } from "@/lib/config/tax-labels";
import {
  CERTIFICATE_TYPES,
  MAX_UPLOAD_BYTES,
  sniffType,
  type FileStore,
} from "@/lib/files/store";
import type { Quarter, TrackerRecord } from "./tracker";

/** A refusal with a message to show as it is. */
export class CertificateError extends Error {}

/** TDS records of active payments in one financial year, with tenant names. */
export async function trackerRecords(
  s: Scoped,
  financialYear: string,
): Promise<TrackerRecord[]> {
  return s.tx
    .select({
      tenantId: tdsRecords.tenantId,
      tenantName: tenants.companyName,
      financialYear: tdsRecords.financialYear,
      quarter: tdsRecords.quarter,
      amount: tdsRecords.amount,
      certificateReceived: tdsRecords.certificateReceived,
      documentId: tdsRecords.certificateDocumentId,
    })
    .from(tdsRecords)
    .innerJoin(payments, eq(payments.id, tdsRecords.paymentId))
    .innerJoin(tenants, eq(tenants.id, tdsRecords.tenantId))
    .where(
      s.where(
        tdsRecords,
        eq(tdsRecords.financialYear, financialYear),
        eq(payments.status, "active"),
      ),
    );
}

export type AttachCertificate = {
  tenantId: string;
  financialYear: string;
  quarter: Quarter;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
};

/** Save the certificate and mark the quarter's TDS records received. */
export async function attachCertificate(
  s: Scoped,
  store: FileStore,
  input: AttachCertificate,
) {
  // What the file really is, from its first bytes, not what the browser says.
  const contentType = sniffType(input.bytes);
  const ext = contentType ? CERTIFICATE_TYPES[contentType] : undefined;
  if (!contentType || !ext)
    throw new CertificateError(
      `Upload the ${TAX_LABELS.tdsCertificate} as a PDF, PNG or JPG file.`,
    );
  if (input.bytes.length === 0)
    throw new CertificateError("That file is empty.");
  if (input.bytes.length > MAX_UPLOAD_BYTES)
    throw new CertificateError(
      "That file is over 3 MB. Upload the PDF from TRACES, or a smaller scan.",
    );
  const [tenant] = await s.tx
    .select({ id: tenants.id, name: tenants.companyName })
    .from(tenants)
    .where(s.where(tenants, eq(tenants.id, input.tenantId)));
  if (!tenant) throw new CertificateError("That tenant couldn't be found.");
  const records = await s.tx
    .select({ id: tdsRecords.id })
    .from(tdsRecords)
    .innerJoin(payments, eq(payments.id, tdsRecords.paymentId))
    .where(
      s.where(
        tdsRecords,
        and(
          eq(tdsRecords.tenantId, input.tenantId),
          eq(tdsRecords.financialYear, input.financialYear),
          eq(tdsRecords.quarter, input.quarter),
          eq(tdsRecords.certificateReceived, false),
          eq(payments.status, "active"),
        ),
      ),
    )
    .for("update", { of: tdsRecords });
  // Records already covered by an earlier certificate keep it.
  if (records.length === 0)
    throw new CertificateError(
      `There's no TDS waiting for a certificate from ${tenant.name} in Q${input.quarter} of FY ${input.financialYear}.`,
    );

  const path = `${s.organizationId}/tds/${input.tenantId}/${input.financialYear}-Q${input.quarter}-${crypto.randomUUID()}.${ext}`;
  // If saving the row fails after this, the file stays in storage with no
  // row pointing at it; harmless, and rare enough to accept.
  await store.put(path, input.bytes, contentType);
  const doc = await insertLogged(s, documents, {
    ownerType: "tenant",
    ownerId: input.tenantId,
    kind: "tds_certificate",
    filePath: path,
    fileName: input.fileName.slice(0, 200) || `certificate.${ext}`,
    contentType,
    sizeBytes: input.bytes.length,
    uploadedBy: s.userId,
  });
  for (const r of records)
    await updateLogged(s, tdsRecords, r.id, {
      certificateReceived: true,
      certificateDocumentId: doc.id,
    });
  return { document: doc, records: records.length };
}

/** One document of this organization, for downloading. */
export async function getDocument(s: Scoped, id: string) {
  const [doc] = await s.tx
    .select()
    .from(documents)
    .where(s.where(documents, eq(documents.id, id)));
  return doc ?? null;
}
