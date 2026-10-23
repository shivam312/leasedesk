import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { WhatsappReminderLink } from "@/components/reminders/WhatsappReminderLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { DateActions } from "@/components/today/DateActions";
import {
  NoticeArea,
  TodayRunBillingForm,
  TodaySendAllForm,
} from "@/components/today/Notices";
import { Badge, Card } from "@/components/ui/field";
import { buttonVariants } from "@/components/ui/button";
import {
  dateTitle,
  dayCount,
  inDays,
  mainActionKey,
  needsAttention,
  SNOOZE_DAYS,
  unpaidTotals,
  type AttentionItem,
} from "@/lib/alerts/attention";
import { attentionInput, hasLeases, monthTotals } from "@/lib/alerts/queries";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { monthOf } from "@/lib/billing/dates";
import { runScoped } from "@/lib/db/scoped";
import { formatDate, formatINR, formatMonth } from "@/lib/format";
import { sendAllConsequence } from "@/lib/invoices/forms";
import { draftTenantsWithoutEmail } from "@/lib/invoices/send";
import {
  whatsappReminder,
  type WhatsappReminder,
} from "@/lib/reminders/manual";
import { todayInIndia } from "@/lib/today";
import { markDateDoneAction, snoozeDateAction } from "@/server/actions/alerts";
import { runBillingNow, sendAllInvoices } from "@/server/actions/billing";

export const metadata: Metadata = { title: "Today" };

const linkButton = buttonVariants({
  variant: "outline",
  className: "h-11 self-start md:h-9",
});

export default function TodayPage() {
  return (
    <>
      <PageHeader
        title="Today"
        description="What to do now: send invoices, chase unpaid tenants, and plan for lease dates."
      />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Today />
      </Suspense>
    </>
  );
}

async function Today() {
  // Today is request data: read the clock at request time, not prerender.
  await connection();
  const today = todayInIndia();
  const member = await requireMember();
  const canBill = can(member.role, "manage_billing");
  const canLease = can(member.role, "manage_leases");
  const data = await runScoped(appDb, member, async (s) => {
    const input = await attentionInput(s, today);
    const totals = await monthTotals(s, today);
    const items = needsAttention(input);
    // The one-tap WhatsApp reminder for each tenant's oldest late invoice,
    // and who has no email for each month waiting to be sent.
    const whatsapp = new Map<string, WhatsappReminder>();
    const noEmail = new Map<string, string[]>();
    if (canBill)
      for (const item of items) {
        if (item.kind === "overdue")
          whatsapp.set(
            item.key,
            await whatsappReminder(s, item.oldestInvoiceId, today),
          );
        if (item.kind === "not_sent")
          noEmail.set(
            item.key,
            await draftTenantsWithoutEmail(s, monthOf(item.month)),
          );
      }
    return {
      anyLeases: await hasLeases(s),
      items,
      totals,
      unpaid: unpaidTotals(input.open, today),
      whatsapp,
      noEmail,
    };
  });
  const { items, totals, unpaid } = data;
  const mainKey = mainActionKey(items);
  const monthLabel = formatMonth(totals.month);

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="This month" className="grid gap-3 md:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">
            Billed in {monthLabel}
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatINR(totals.billedPaise)}
          </p>
          <p className="text-sm text-muted-foreground">Invoices sent</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">
            Collected in {monthLabel}
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatINR(totals.collectedPaise)}
          </p>
          <p className="text-sm text-muted-foreground">
            {totals.tdsKeptPaise > 0
              ? `Plus ${formatINR(totals.tdsKeptPaise)} TDS kept back`
              : "Money received"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Unpaid now</p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatINR(unpaid.unpaidPaise)}
          </p>
          <p className="text-sm text-muted-foreground">
            {unpaid.overduePaise > 0
              ? `${formatINR(unpaid.overduePaise)} of it overdue`
              : "Nothing overdue"}
          </p>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">
          Needs attention{items.length > 0 ? ` (${items.length})` : ""}
        </h2>
        <NoticeArea>
          {items.length === 0 ? (
            <NothingToDo anyLeases={data.anyLeases} />
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.key}>
                  <Card className="flex flex-col gap-3">
                    <Item
                      item={item}
                      canBill={canBill}
                      canLease={canLease}
                      primary={item.key === mainKey}
                      whatsapp={data.whatsapp.get(item.key)}
                      noEmail={data.noEmail.get(item.key) ?? []}
                    />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </NoticeArea>
      </section>
    </div>
  );
}

function NothingToDo({ anyLeases }: { anyLeases: boolean }) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <p className="text-sm">
        {anyLeases
          ? "Nothing needs attention today. Unpaid rent, invoices to send and lease dates coming up show here when they need you."
          : "No leases yet. Add your first lease, and Today will show the invoices to send, unpaid rent and lease dates each month."}
      </p>
      {anyLeases ? (
        <Link href="/leases" className={linkButton}>
          See leases
        </Link>
      ) : (
        <Link
          href="/leases/new"
          className={buttonVariants({ className: "h-11 self-start md:h-9" })}
        >
          Add lease
        </Link>
      )}
    </div>
  );
}

function Heading({
  title,
  badge,
  detail,
}: {
  title: string;
  badge?: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium break-words">{title}</h3>
        {badge}
      </div>
      <p className="text-sm break-words text-muted-foreground">{detail}</p>
    </div>
  );
}

function Item({
  item,
  canBill,
  canLease,
  primary,
  whatsapp,
  noEmail,
}: {
  item: AttentionItem;
  canBill: boolean;
  canLease: boolean;
  /** This item's button is the screen's one filled button. */
  primary: boolean;
  whatsapp: WhatsappReminder | undefined;
  noEmail: string[];
}) {
  switch (item.kind) {
    case "overdue": {
      const many = item.invoiceCount > 1;
      return (
        <>
          <Heading
            title={`${item.tenantName} hasn't paid ${formatINR(item.amountPaise)}`}
            badge={<Badge tone="bad">Overdue</Badge>}
            detail={`${many ? `${item.invoiceCount} invoices unpaid. Oldest was due` : "Invoice was due"} ${formatDate(item.oldestDueDate)} (${dayCount(item.daysOverdue)} ago).`}
          />
          <div className="flex flex-wrap items-start gap-2">
            {whatsapp?.kind === "ready" && (
              <WhatsappReminderLink
                invoiceId={item.oldestInvoiceId}
                url={whatsapp.url}
                contactName={whatsapp.contactName}
              />
            )}
            <Link
              href={
                many
                  ? `/tenants/${item.tenantId}/ledger`
                  : `/billing/invoices/${item.oldestInvoiceId}`
              }
              className={linkButton}
            >
              {many ? "See what they owe" : "Open invoice"}
            </Link>
            {whatsapp?.kind === "no_number" && (
              <Link
                href={`/tenants/${item.tenantId}/edit`}
                className={linkButton}
              >
                Add WhatsApp number
              </Link>
            )}
          </div>
        </>
      );
    }
    case "not_made": {
      const label = formatMonth(item.month);
      return (
        <>
          <Heading
            title={`${label} invoices aren't made yet`}
            detail="Make them to work out what every tenant owes this month."
          />
          {canBill ? (
            <TodayRunBillingForm
              month={item.month}
              monthLabel={label}
              hasDrafts={false}
              primary={primary}
              action={runBillingNow}
            />
          ) : (
            <p className="text-sm">Ask the owner or accountant to make them.</p>
          )}
        </>
      );
    }
    case "not_sent": {
      const month = monthOf(item.month);
      const label = formatMonth(month);
      const word = item.count === 1 ? "invoice" : "invoices";
      return (
        <>
          <Heading
            title={`${item.count} ${label} ${word} not sent yet`}
            badge={<Badge tone="warn">Not sent yet</Badge>}
            detail={`${formatINR(item.totalPaise)} in all. Tenants can't pay until they get them.`}
          />
          <div className="flex flex-wrap items-start gap-2">
            {canBill && (
              <TodaySendAllForm
                month={month}
                monthLabel={label}
                count={item.count}
                total={formatINR(item.totalPaise)}
                consequence={sendAllConsequence(noEmail)}
                primary={primary}
                action={sendAllInvoices}
              />
            )}
            <Link href={`/billing?month=${month}`} className={linkButton}>
              Check them first
            </Link>
          </div>
        </>
      );
    }
    case "bank_lines":
      return (
        <>
          <Heading
            title={`${item.count} bank ${item.count === 1 ? "line" : "lines"} to match`}
            detail="Money in your bank statement that isn't recorded as a payment yet."
          />
          <Link href="/billing/bank/match" className={linkButton}>
            Match payments
          </Link>
        </>
      );
    case "tds_missing":
      return (
        <>
          <Heading
            title={`${item.count} TDS ${item.count === 1 ? "certificate" : "certificates"} missing`}
            badge={<Badge tone="warn">Overdue</Badge>}
            detail="Tenants kept back TDS but haven't sent the certificate for it. Ask them to send it."
          />
          <Link
            href={`/billing/tds?fy=${item.financialYear}&missing=1`}
            className={linkButton}
          >
            See missing certificates
          </Link>
        </>
      );
    case "date": {
      const d = item.date;
      const title = dateTitle(d);
      return (
        <>
          <Heading
            title={`${title} ${inDays(item.daysAway)}`}
            badge={
              item.daysAway <= 7 ? (
                <Badge tone="warn">This week</Badge>
              ) : undefined
            }
            detail={`${d.tenantName} · ${d.buildingName} · ${formatDate(d.date)}`}
          />
          <div className="flex flex-wrap items-start gap-2">
            <Link href={`/leases/${d.leaseId}`} className={linkButton}>
              Open lease
            </Link>
            {canLease && (
              <DateActions
                dateId={d.id}
                what={`${title} for ${d.tenantName}`}
                markDone={markDateDoneAction}
                snooze={snoozeDateAction}
                snoozeDays={SNOOZE_DAYS}
              />
            )}
          </div>
        </>
      );
    }
  }
}
