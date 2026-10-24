import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Select } from "@/components/ui/input";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import {
  earlierTallyExports,
  tallyBusiness,
  tallyExportData,
} from "@/lib/exports/tally-data";
import { formatDate, formatINR } from "@/lib/format";
import { reportParams } from "@/lib/reports/registry";
import { todayInIndia } from "@/lib/today";

export const metadata: Metadata = { title: "Tally export" };

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export default function TallyPage({
  searchParams,
}: PageProps<"/reports/tally">) {
  return (
    <>
      <Link
        href="/reports"
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← Reports
      </Link>
      <PageHeader
        title="Tally export"
        description="Sent invoices, credit notes and payments between two dates, as a file your accountant imports into TallyPrime."
      />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Body({
  searchParams,
}: {
  searchParams: PageProps<"/reports/tally">["searchParams"];
}) {
  const search = await searchParams;
  await connection();
  const { from, to } = reportParams(search, todayInIndia());
  const member = await requireMember();
  const { vouchers, earlier, entities, entityId, leftOut } = await runScoped(
    appDb,
    member,
    async (s) => {
      const business = await tallyBusiness(s, search.business);
      const data = await tallyExportData(s, from, to, business.entityId);
      return {
        ...business,
        vouchers: data.vouchers,
        leftOut: data.paymentsLeftOut,
        earlier: await earlierTallyExports(s, data.documentIds),
      };
    },
  );
  const count = (type: string) =>
    vouchers.filter((v) => v.type === type).length;
  const sales = vouchers
    .filter((v) => v.type === "Sales")
    .reduce((t, v) => t + (v.entries[0]?.amount ?? 0), 0);
  const canExport = can(member.role, "manage_billing");
  const query = `from=${from}&to=${to}${entities.length > 1 ? `&business=${entityId ?? "all"}` : ""}`;
  const repeated = earlier.reduce((max, e) => Math.max(max, e.overlap), 0);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          From
          <DateInput
            name="from"
            defaultValue={from}
            className="h-11 w-44 md:h-9"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          To
          <DateInput name="to" defaultValue={to} className="h-11 w-44 md:h-9" />
        </label>
        {entities.length > 1 && (
          <label className="flex flex-col gap-1 text-sm">
            Business (one file per Tally company)
            <Select
              name="business"
              defaultValue={entityId ?? "all"}
              className="h-11 md:h-9"
            >
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.legalName}
                  {e.gstin ? ` (${e.gstin})` : ""}
                </option>
              ))}
              <option value="all">All businesses in one file</option>
            </Select>
          </label>
        )}
        <Button type="submit" variant="outline" className="h-11 md:h-9">
          Show
        </Button>
      </form>
      {vouchers.length === 0 ? (
        <p className="text-sm">
          No sent invoices, credit notes or payments from {formatDate(from)} to{" "}
          {formatDate(to)}. Choose other dates, or send this month&apos;s
          invoices from{" "}
          <Link
            href="/billing"
            className="inline-flex min-h-11 items-center underline md:min-h-0"
          >
            Billing
          </Link>
          .
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1 text-sm">
            <li title="Sales vouchers">
              {plural(count("Sales"), "invoice")}, {formatINR(sales)} in all
            </li>
            <li title="Credit Note vouchers">
              {plural(count("Credit Note"), "credit note")}
            </li>
            <li title="Receipt vouchers, with TDS on its own ledger">
              {plural(count("Receipt"), "payment")}
            </li>
            {count("Journal") > 0 && (
              <li title="Journal vouchers">
                {plural(
                  count("Journal"),
                  "reversed payment or credit applied",
                  "reversed payments or credit applied",
                )}
              </li>
            )}
          </ul>
          <p className="text-xs text-muted-foreground">
            In Tally these are Sales, Credit Note, Receipt and Journal vouchers.
          </p>
          {leftOut > 0 && (
            <p role="status" className="text-sm">
              {plural(leftOut, "payment")} {leftOut === 1 ? "isn't" : "aren't"}{" "}
              in this file: {leftOut === 1 ? "it pays" : "they pay"} more than
              one business&apos;s invoices, or nothing yet. They&apos;re in the
              file for all businesses.
            </p>
          )}
          {earlier.length > 0 && (
            <p
              role="status"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              {repeated} of these {vouchers.length}{" "}
              {repeated === 1 ? "is" : "are"} already in a Tally file made on{" "}
              {formatDate(todayInIndia(earlier[0]!.createdAt))} (for{" "}
              {formatDate(earlier[0]!.periodStart)} to{" "}
              {formatDate(earlier[0]!.periodEnd)}). Importing them again makes
              duplicates in Tally, unless your accountant deletes the earlier
              ones first.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {canExport ? (
              <a
                href={`/reports/tally/xml?${query}`}
                download
                className={buttonVariants({ className: "h-11 md:h-9" })}
              >
                {earlier.length > 0
                  ? "Download Tally file anyway"
                  : "Download Tally file"}
              </a>
            ) : null}
            <a
              href={`/reports/tally/xlsx?${query}`}
              download
              className={buttonVariants({
                variant: canExport ? "outline" : "default",
                className: "h-11 md:h-9",
              })}
            >
              Download as Excel
            </a>
          </div>
          {!canExport && (
            <p className="text-sm text-muted-foreground">
              Only an owner or accounts can make the Tally file.
            </p>
          )}
        </>
      )}
      <p className="text-sm text-muted-foreground">
        Ledger names come from{" "}
        {can(member.role, "manage_settings") ? (
          <Link href="/settings/tally" className="underline">
            Settings → Tally
          </Link>
        ) : (
          "Settings → Tally"
        )}
        . In TallyPrime: Import → Transactions, and choose the file. Check a few
        vouchers after the first import.
      </p>
    </div>
  );
}
