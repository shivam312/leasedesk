// A lease's or tenant's document as uploaded, opened in the browser.

import { notFound } from "next/navigation";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { contentDisposition } from "@/lib/files/store";
import { supabaseStore } from "@/lib/files/supabase";
import { getDocument } from "@/lib/tds/certificates";

export async function GET(_req: Request, ctx: RouteContext<"/documents/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const doc = await runScoped(appDb, member, (s) => getDocument(s, id));
  if (!doc) notFound();
  const file = await (await supabaseStore()).get(doc.filePath);
  if (!file)
    return new Response(
      "This file couldn't be found in storage. Upload it again.",
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": contentDisposition(doc.fileName),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
