// A credit note as a PDF, printed from its invoice's frozen copies.

import { notFound } from "next/navigation";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { creditNoteDocument } from "@/lib/invoices/credit-note-document";
import { getCreditNote } from "@/lib/invoices/credit-notes";
import { pdfFileName } from "@/lib/invoices/document";
import { renderInvoicePdf } from "@/lib/invoices/pdf";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/billing/credit-notes/[id]/pdf">,
) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const saved = await runScoped(appDb, member, (s) => getCreditNote(s, id));
  if (!saved) notFound();
  let pdf: Buffer;
  try {
    pdf = await renderInvoicePdf(creditNoteDocument(saved));
  } catch (error) {
    console.error("Credit note PDF failed", id, error);
    return new Response(
      "We couldn't make this PDF. Go back to the invoice and try again.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName(saved.note.number, true)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
