// The sent invoice's PDF, kept as it was sent: stored in Supabase Storage at
// send time (invoices.pdf_path, filled once) and served for later downloads
// while it is still right, so a change to the PDF layout never changes a
// sent invoice. The file prints "To pay" and a UPI QR for the amount asked
// at send time; once the invoice is part-paid, paid, cancelled or credited,
// the PDF is rendered from its frozen copies (D18) again, so it carries the
// PAID or CANCELLED notice and no QR for an amount no longer owed. Invoices
// sent before the file was kept always render from the frozen copies.

import { eq, sum } from "drizzle-orm";
import { updateLogged } from "@/lib/db/activity-log";
import { paiseSum } from "@/lib/db/rows";
import { creditNotes, invoices } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import type { FileStore } from "@/lib/files/store";
import type { InvoiceStatus } from "./status";

/**
 * Whether the send-time file still says the right thing: the invoice is
 * sent (or overdue) and nothing has been credited, so what it asks the
 * tenant to pay is unchanged.
 */
export function storedPdfIsCurrent(
  status: InvoiceStatus,
  creditedPaise: number,
): boolean {
  return (status === "sent" || status === "overdue") && creditedPaise === 0;
}

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

/**
 * The stored PDF of a sent invoice while it is still current, or null: a
 * draft, sent before M9, missing, or an invoice whose balance has since
 * changed (part-paid, paid, cancelled or credited), which renders again.
 */
export async function storedPdf(
  s: Scoped,
  store: FileStore,
  invoiceId: string,
): Promise<Uint8Array | null> {
  const [invoice] = await s.tx
    .select({ pdfPath: invoices.pdfPath, status: invoices.status })
    .from(invoices)
    .where(s.where(invoices, eq(invoices.id, invoiceId)));
  if (!invoice?.pdfPath) return null;
  const [credit] = await s.tx
    .select({ total: sum(creditNotes.total).mapWith(paiseSum) })
    .from(creditNotes)
    .where(s.where(creditNotes, eq(creditNotes.invoiceId, invoiceId)));
  if (!storedPdfIsCurrent(invoice.status, credit?.total ?? 0)) return null;
  return (await store.get(invoice.pdfPath))?.bytes ?? null;
}
