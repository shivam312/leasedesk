// The invoice as a PDF, opened in the browser. A draft prints with a "Draft"
// notice and no payment QR; a sent invoice prints from its frozen copies.

import { notFound } from "next/navigation";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { pdfFileName } from "@/lib/invoices/document";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
import { getInvoiceDocument } from "@/lib/invoices/queries";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/billing/invoices/[id]/pdf">,
) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const doc = await runScoped(appDb, member, (s) => getInvoiceDocument(s, id));
  if (!doc) notFound();
  let pdf: Buffer;
  try {
    pdf = await renderInvoicePdf(doc);
  } catch (error) {
    console.error("Invoice PDF failed", id, error);
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
