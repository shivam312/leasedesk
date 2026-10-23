import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { RequirePermission } from "@/components/shell/RequirePermission";
import { PageHeader } from "@/components/shell/PageHeader";
import { CertificateUpload } from "@/components/tds/CertificateUpload";
import { appDb, requireMember } from "@/lib/auth";
import { TAX_LABELS } from "@/lib/config/tax-labels";
import { runScoped } from "@/lib/db/scoped";
import { formatINR } from "@/lib/format";
import { trackerRecords } from "@/lib/tds/certificates";
import { financialYearChoices, tdsTracker } from "@/lib/tds/tracker";
import { getTenant } from "@/lib/tenants/queries";
import { todayInIndia } from "@/lib/today";
import { uploadCertificateAction } from "@/server/actions/tds";

export const metadata: Metadata = { title: "Upload TDS certificate" };

const QUARTERS = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];

export default function UploadPage({
  searchParams,
}: PageProps<"/billing/tds/upload">) {
  return (
    <RequirePermission
      permission="manage_billing"
      message="Only an owner or accounts person can upload TDS certificates."
      back={{ href: "/billing/tds", label: "Back to TDS certificates" }}
    >
      <Link
        href="/billing/tds"
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← TDS certificates
      </Link>
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Upload searchParams={searchParams} />
      </Suspense>
    </RequirePermission>
  );
}

async function Upload({
  searchParams,
}: {
  searchParams: PageProps<"/billing/tds/upload">["searchParams"];
}) {
  const { tenant, fy, q } = await searchParams;
  await connection();
  const years = financialYearChoices(todayInIndia());
  const quarter = Number(q);
  const valid =
    typeof tenant === "string" &&
    /^[0-9a-f-]{36}$/.test(tenant) &&
    typeof fy === "string" &&
    years.includes(fy) &&
    [1, 2, 3, 4].includes(quarter);
  const member = await requireMember();
  const data = valid
    ? await runScoped(appDb, member, async (s) => ({
        tenant: await getTenant(s, tenant),
        records: await trackerRecords(s, fy),
      }))
    : null;
  if (!valid || !data?.tenant)
    return (
      <p className="text-sm">
        That tenant or quarter couldn&apos;t be found. Open the{" "}
        <Link href="/billing/tds" className="underline">
          TDS certificates
        </Link>{" "}
        list and choose Upload certificate next to the quarter.
      </p>
    );
  const row = tdsTracker({
    financialYear: fy,
    today: todayInIndia(),
    records: data.records,
  }).rows.find((r) => r.tenantId === tenant);
  const cell = row?.quarters[quarter - 1];
  return (
    <>
      <PageHeader
        title={`TDS certificate from ${data.tenant.tenant.companyName}`}
        description={`Q${quarter} (${QUARTERS[quarter - 1]}) of FY ${fy}${cell && cell.amount > 0 ? `: ${formatINR(cell.amount)} TDS per your records. Check the certificate shows the same amount.` : "."}`}
      />
      <CertificateUpload
        tenantId={tenant}
        financialYear={fy}
        quarter={quarter}
        label={`TDS certificate (${TAX_LABELS.tdsCertificate}) file`}
        action={uploadCertificateAction}
      />
    </>
  );
}
