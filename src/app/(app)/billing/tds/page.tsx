import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { RequestCertificateForm } from "@/components/tds/RequestCertificateForm";
import { lastRequests } from "@/lib/tds/requests";
import { requestCertificateAction } from "@/server/actions/tds";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { TAX_LABELS } from "@/lib/config/tax-labels";
import { runScoped } from "@/lib/db/scoped";
import { formatDate, formatINR } from "@/lib/format";
import { trackerRecords } from "@/lib/tds/certificates";
import {
  financialYearChoices,
  tdsTracker,
  type QuarterCell,
} from "@/lib/tds/tracker";
import { todayInIndia } from "@/lib/today";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "TDS certificates" };

const QUARTERS = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];

export default function TdsPage({ searchParams }: PageProps<"/billing/tds">) {
  return (
    <>
      <Link
        href="/billing"
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← Billing
      </Link>
      <PageHeader
        title="TDS certificates"
        description={`TDS tenants kept back from rent, by quarter, and whether their TDS certificate (${TAX_LABELS.tdsCertificate}) is in.`}
      />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading TDS…</p>}
      >
        <Tracker searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function Cell({
  c,
  tenantId,
  fy,
  canUpload,
  askedOn,
}: {
  c: QuarterCell;
  tenantId: string;
  fy: string;
  canUpload: boolean;
  askedOn: Date | undefined;
}) {
  if (c.status === "none")
    return (
      <span className="text-muted-foreground">
        <span aria-hidden>–</span>
        <span className="sr-only">No TDS</span>
      </span>
    );
  const upload = `/billing/tds/upload?tenant=${tenantId}&fy=${fy}&q=${c.quarter}`;
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="tabular-nums">{formatINR(c.amount)}</span>
      {c.status === "received" ? (
        <Badge tone="good">Received</Badge>
      ) : (
        <Badge tone={c.overdue ? "bad" : "warn"}>
          {c.overdue
            ? "Overdue"
            : c.status === "part"
              ? "Part received"
              : "Not received"}
        </Badge>
      )}
      {c.documentIds.map((d, i) => (
        <a
          key={d}
          href={`/billing/tds/certificates/${d}`}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 items-center text-sm underline md:min-h-0"
        >
          View certificate{c.documentIds.length > 1 ? ` ${i + 1}` : ""}
        </a>
      ))}
      {c.status !== "received" && canUpload && (
        <Link
          href={upload}
          className="inline-flex min-h-11 items-center text-sm underline md:min-h-0"
        >
          Upload certificate
        </Link>
      )}
      {c.status !== "received" && c.overdue && canUpload && (
        <RequestCertificateForm
          tenantId={tenantId}
          financialYear={fy}
          quarter={c.quarter}
          amount={c.amount}
          askedOn={askedOn ? formatDate(todayInIndia(askedOn)) : null}
          action={requestCertificateAction}
        />
      )}
    </span>
  );
}

async function Tracker({
  searchParams,
}: {
  searchParams: PageProps<"/billing/tds">["searchParams"];
}) {
  const {
    fy: param,
    missing,
    q: rawQ,
    quarter: rawQuarter,
  } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ.trim().slice(0, 80) : "";
  const quarter =
    typeof rawQuarter === "string" && /^[1-4]$/.test(rawQuarter)
      ? Number(rawQuarter)
      : null;
  const onlyMissing = missing === "1";
  await connection();
  const today = todayInIndia();
  const years = financialYearChoices(today);
  const fy =
    typeof param === "string" && years.includes(param) ? param : years[0]!;
  const member = await requireMember();
  const [records, asked] = await runScoped(appDb, member, (s) =>
    Promise.all([trackerRecords(s, fy), lastRequests(s, fy)]),
  );
  const { rows: all, totals } = tdsTracker({
    financialYear: fy,
    today,
    records,
  });
  const rows = all
    .filter((r) => !onlyMissing || r.missing > 0)
    .filter((r) => !q || r.tenantName.toLowerCase().includes(q.toLowerCase()))
    // A quarter: tenants with TDS in it (missing only, if that's on).
    .filter((r) => {
      if (!quarter) return true;
      const c = r.quarters.find((x) => x.quarter === quarter);
      return (
        !!c && c.status !== "none" && (!onlyMissing || c.status !== "received")
      );
    });
  const canUpload = can(member.role, "manage_billing");
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Financial year" className="flex flex-wrap gap-2">
        {years.map((y) => (
          <Link
            key={y}
            href={`/billing/tds?fy=${y}${onlyMissing ? "&missing=1" : ""}`}
            aria-current={y === fy ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm md:min-h-9",
              y === fy && "bg-primary text-primary-foreground",
            )}
          >
            FY {y}
          </Link>
        ))}
        {all.length > 0 && (
          <Link
            href={`/billing/tds?fy=${fy}${onlyMissing ? "" : "&missing=1"}`}
            aria-current={onlyMissing ? "true" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm md:min-h-9",
              onlyMissing && "bg-primary text-primary-foreground",
            )}
          >
            Only missing certificates
          </Link>
        )}
      </nav>
      {all.length > 0 && (
        <form
          method="get"
          className="flex flex-col gap-2 md:flex-row md:items-end"
          aria-label="Find TDS"
        >
          <input type="hidden" name="fy" value={fy} />
          {onlyMissing && <input type="hidden" name="missing" value="1" />}
          <Input
            type="search"
            name="q"
            defaultValue={q}
            aria-label="Search tenants"
            placeholder="Search by tenant"
            className="md:max-w-sm"
          />
          <Select
            name="quarter"
            defaultValue={quarter ? String(quarter) : ""}
            aria-label="Quarter"
            className="md:w-56"
          >
            <option value="">All quarters</option>
            <option value="1">Q1 (April–June)</option>
            <option value="2">Q2 (July–September)</option>
            <option value="3">Q3 (October–December)</option>
            <option value="4">Q4 (January–March)</option>
          </Select>
          <Button type="submit" variant="outline" className="h-11 md:h-9">
            Show
          </Button>
        </form>
      )}
      {all.length === 0 ? (
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="text-sm">
            No TDS recorded for FY {fy}. When you record a payment with TDS, it
            shows here so you can collect the tenant&apos;s TDS certificate (
            {TAX_LABELS.tdsCertificate}).
          </p>
          {canUpload && (
            <Link
              href="/billing/payments/new"
              className={buttonVariants({
                className: "h-11 self-start md:h-9",
              })}
            >
              Record payment
            </Link>
          )}
        </div>
      ) : rows.length === 0 && (q || quarter) ? (
        <p className="max-w-2xl text-sm">
          No tenants match.{" "}
          <Link href={`/billing/tds?fy=${fy}`} className="underline">
            Show all tenants
          </Link>
        </p>
      ) : rows.length === 0 ? (
        <p className="max-w-2xl text-sm">
          Every certificate for FY {fy} is in.{" "}
          <Link href={`/billing/tds?fy=${fy}`} className="underline">
            Show all tenants
          </Link>
        </p>
      ) : (
        <>
          <p className="max-w-2xl text-sm">
            {formatINR(totals.total)} TDS in FY {fy}.{" "}
            {totals.missing > 0
              ? `Certificates missing for ${formatINR(totals.missing)}${totals.overdueCount > 0 ? `; ${totals.overdueCount} ${totals.overdueCount === 1 ? "quarter is" : "quarters are"} overdue` : ""}.`
              : "Every certificate is in."}
          </p>
          <table className="hidden w-full text-sm md:table">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 font-normal">Tenant</th>
                {QUARTERS.map((q, i) => (
                  <th key={q} className="py-2 font-normal">
                    Q{i + 1} ({q})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tenantId} className="border-t align-top">
                  <td className="max-w-xs py-2 pr-4 break-words">
                    <Link
                      href={`/tenants/${r.tenantId}`}
                      className="font-medium hover:underline"
                    >
                      {r.tenantName}
                    </Link>
                  </td>
                  {r.quarters.map((c) => (
                    <td key={c.quarter} className="py-2 pr-4">
                      <Cell
                        c={c}
                        tenantId={r.tenantId}
                        fy={fy}
                        canUpload={canUpload}
                        askedOn={asked.get(`${r.tenantId}|${c.quarter}`)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((r) => (
              <li key={r.tenantId} className="rounded-lg border p-4">
                <Link
                  href={`/tenants/${r.tenantId}`}
                  className="font-medium break-words hover:underline"
                >
                  {r.tenantName}
                </Link>
                <dl className="mt-2 flex flex-col gap-3 text-sm">
                  {r.quarters
                    .filter((c) => c.status !== "none")
                    .map((c) => (
                      <div key={c.quarter}>
                        <dt className="text-muted-foreground">
                          Q{c.quarter} ({QUARTERS[c.quarter - 1]}), due{" "}
                          {formatDate(c.due)}
                        </dt>
                        <dd>
                          <Cell
                            c={c}
                            tenantId={r.tenantId}
                            fy={fy}
                            canUpload={canUpload}
                            askedOn={asked.get(`${r.tenantId}|${c.quarter}`)}
                          />
                        </dd>
                      </div>
                    ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
