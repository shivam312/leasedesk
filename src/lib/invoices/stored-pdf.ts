// The sent invoice's PDF, kept as it was sent: stored in Supabase Storage at
// send time (invoices.pdf_path, filled once) and served for every later
// download, so a change to the PDF layout never changes a sent invoice.
// Invoices sent before this keep rendering from their frozen copies (D18).

import { eq } from "drizzle-orm";
import { updateLogged } from "@/lib/db/activity-log";
import { invoices } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import type { FileStore } from "@/lib/files/store";

/** Inside the organization's folder, as the storage policies need. */
export function invoicePdfPath(organizationId: string, invoiceId: string) {
  return `${organizationId}/invoices/${invoiceId}.pdf`;
}

/**
 * Store a sent invoice's PDF and record where (once, logged). Returns false
 * if the invoice already has one or isn't sent.
 */
export async function storeSentPdf(
  s: Scoped,
  store: FileStore,
  invoiceId: string,
  pdf: Uint8Array,
): Promise<boolean> {
  const [invoice] = await s.tx
    .select({ status: invoices.status, pdfPath: invoices.pdfPath })
    .from(invoices)
    .where(s.where(invoices, eq(invoices.id, invoiceId)));
  if (!invoice || invoice.pdfPath || invoice.status === "draft") return false;
  const path = invoicePdfPath(s.organizationId, invoiceId);
  await store.put(path, pdf, "application/pdf");
  const saved = await updateLogged(s, invoices, invoiceId, { pdfPath: path });
  return !!saved;
}

/** The stored PDF of a sent invoice, or null (draft, sent before M9, or missing). */
export async function storedPdf(
  s: Scoped,
  store: FileStore,
  invoiceId: string,
): Promise<Uint8Array | null> {
  const [invoice] = await s.tx
    .select({ pdfPath: invoices.pdfPath })
    .from(invoices)
    .where(s.where(invoices, eq(invoices.id, invoiceId)));
  if (!invoice?.pdfPath) return null;
  return (await store.get(invoice.pdfPath))?.bytes ?? null;
}
