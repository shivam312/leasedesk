// The Excel template for an import.

import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { IMPORT_TEMPLATES } from "@/lib/imports/registry";
import { templateWorkbook } from "@/lib/imports/templates";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/leases/import/template/[kind]">,
) {
  const { kind } = await ctx.params;
  const template = IMPORT_TEMPLATES[kind as keyof typeof IMPORT_TEMPLATES];
  if (!template) notFound();
  await requireMember();
  return new Response(
    new Uint8Array(
      templateWorkbook(template.title, template.intro, template.sheets),
    ),
    {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${kind}-template.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
