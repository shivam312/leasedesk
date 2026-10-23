import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ReportView } from "@/components/reports/ReportView";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import {
  findReport,
  REPORTS,
  reportParams,
  searchReport,
} from "@/lib/reports/registry";
import { financialYearChoices } from "@/lib/tds/tracker";
import { todayInIndia } from "@/lib/today";

export function generateStaticParams() {
  return REPORTS.map((r) => ({ report: r.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/reports/[report]">): Promise<Metadata> {
  const { report } = await params;
  return { title: findReport(report)?.title ?? "Reports" };
}

export default async function ReportPage({
  params,
  searchParams,
}: PageProps<"/reports/[report]">) {
  const { report: slug } = await params;
  const def = findReport(slug);
  if (!def) notFound();
  return (
    <>
      <Link
        href="/reports"
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← Reports
      </Link>
      <PageHeader title={def.title} description={def.description} />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading report…</p>
        }
      >
        <Body slug={slug} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Body({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: PageProps<"/reports/[report]">["searchParams"];
}) {
  const def = findReport(slug)!;
  const search = await searchParams;
  await connection();
  const p = reportParams(search, todayInIndia());
  const q = typeof search.q === "string" ? search.q : "";
  const member = await requireMember();
  const report = searchReport(
    await runScoped(appDb, member, (s) => def.load(s, p)),
    q,
  );
  const rows = report.sections.reduce((t, sec) => t + sec.rows.length, 0);
  return (
    <div className="flex flex-col gap-6">
      <form
        method="get"
        className="flex flex-wrap items-end gap-3"
        aria-label="Filter the report"
      >
        {def.filter === "asOf" && (
          <label className="flex flex-col gap-1 text-sm">
            As on
            <Input
              type="date"
              name="asOf"
              defaultValue={p.asOf}
              className="h-11 w-44 md:h-9"
            />
          </label>
        )}
        {def.filter === "range" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              From
              <Input
                type="date"
                name="from"
                defaultValue={p.from}
                className="h-11 w-44 md:h-9"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              To
              <Input
                type="date"
                name="to"
                defaultValue={p.to}
                className="h-11 w-44 md:h-9"
              />
            </label>
          </>
        )}
        {def.filter === "month" && (
          <label className="flex flex-col gap-1 text-sm">
            Month
            <Input
              type="month"
              name="month"
              defaultValue={p.month}
              className="h-11 w-44 md:h-9"
            />
          </label>
        )}
        {def.filter === "fy" && (
          <label className="flex flex-col gap-1 text-sm">
            Financial year
            <Select
              name="fy"
              defaultValue={p.financialYear}
              className="h-11 w-44 md:h-9"
            >
              {financialYearChoices(p.today).map((y) => (
                <option key={y} value={y}>
                  FY {y}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Search
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Tenant, building or unit"
            className="h-11 w-60 md:h-9"
          />
        </label>
        <Button type="submit" variant="outline" className="h-11 md:h-9">
          Show
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {report.period}
        {q ? ` · ${rows} ${rows === 1 ? "row matches" : "rows match"}` : ""}
      </p>
      <ReportView report={report} />
    </div>
  );
}
