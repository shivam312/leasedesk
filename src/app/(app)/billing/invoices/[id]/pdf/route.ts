// The invoice as a PDF, opened in the browser. A draft prints with a "Draft"
// notice and no payment QR; a sent invoice is the PDF stored when it was
// sent, or, if sent before that was kept, prints from its frozen copies.

import { notFound } from "next/navigation";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { pdfFileName } from "@/lib/invoices/document";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
import { getInvoiceDocument } from "@/lib/invoices/queries";
import { storedPdf } from "@/lib/invoices/stored-pdf";
import { supabaseStore } from "@/lib/files/supabase";
import { reportError } from "@/lib/monitoring";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/billing/invoices/[id]/pdf">,
) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const doc = await runScoped(appDb, member, (s) => getInvoiceDocument(s, id));
  if (!doc) notFound();
  let pdf: Uint8Array;
  try {
    // A sent invoice's stored file, exactly as it went; otherwise rendered
    // (drafts, and invoices sent before the PDF was kept).
    const stored = await runScoped(appDb, member, async (s) =>
      storedPdf(s, await supabaseStore(), id),
    ).catch(() => null);
    pdf = stored ?? (await renderInvoicePdf(doc));
  } catch (error) {
    reportError("Invoice PDF failed", error, { invoiceId: id });
    return new Response(
      "We couldn't make this PDF. Go back to the invoice and try again; if it keeps happening, check the business details in Settings.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName(doc.number)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
