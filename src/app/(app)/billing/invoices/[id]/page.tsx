import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  EmailAgainForm,
  SendInvoiceForm,
} from "@/components/invoices/SendForms";
import { INVOICE_STATUS } from "@/components/invoices/status";
import { shownStatus } from "@/lib/invoices/status";
import { Working } from "@/components/invoices/Working";
import { WhatsappReminderLink } from "@/components/reminders/WhatsappReminderLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { formatDate, formatINR, formatMonth } from "@/lib/format";
import { creditNotesFor } from "@/lib/invoices/credit-notes";
import { CREDIT_REASONS } from "@/lib/invoices/credit-note-document";
import { lineWorking, totalWorking } from "@/lib/invoices/explain";
import { tooEarlyToSend } from "@/lib/invoices/forms";
import { getInvoice } from "@/lib/invoices/queries";
import { reminderStepWords } from "@/lib/reminders/email";
import { whatsappReminder } from "@/lib/reminders/manual";
import { remindersFor } from "@/lib/reminders/queries";
import { loadSettings } from "@/lib/settings/store";
import { todayInIndia } from "@/lib/today";
import { emailInvoiceAgain, sendInvoice } from "@/server/actions/billing";

export const metadata: Metadata = { title: "Invoice" };

export default function InvoicePage({
  params,
}: PageProps<"/billing/invoices/[id]">) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading the invoice…</p>
      }
    >
      <Invoice params={params} />
    </Suspense>
  );
}

async function Invoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const canBill = can(member.role, "manage_billing");
  const data = await runScoped(appDb, member, async (s) => {
    const saved = await getInvoice(s, id);
    return saved
      ? {
          ...saved,
          credits: await creditNotesFor(s, id),
          reminders: await remindersFor(s, id),
          whatsapp: canBill
            ? await whatsappReminder(s, id, todayInIndia())
            : null,
          autoRemind: (await loadSettings(s, { tenantId: saved.tenant.id }))[
            "reminders.autoSend"
          ],
        }
      : null;
  });
  if (!data) notFound();
  const { credits, reminders, autoRemind, whatsapp } = data;
  const { invoice, tenant, building, lines } = data;
  const status = INVOICE_STATUS[shownStatus(invoice, todayInIndia())];
  const month = invoice.runMonth.slice(0, 7);
  const early = tooEarlyToSend(invoice.invoiceDate, todayInIndia());
  const interState = invoice.supplyType === "inter_state";
  const totals: [string, number][] = [
    ["Before GST", invoice.taxableTotal],
    ...(interState
      ? ([["IGST", invoice.igstTotal]] as [string, number][])
      : ([
          ["CGST", invoice.cgstTotal],
          ["SGST", invoice.sgstTotal],
        ] as [string, number][])),
    ...(invoice.roundOff !== 0
      ? ([["Round off", invoice.roundOff]] as [string, number][])
      : []),
  ];

  return (
    <>
      <Link
        href={`/billing?month=${month}`}
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← {formatMonth(month)} invoices
      </Link>
      <PageHeader
        title={tenant.companyName}
        description={`${building.name} · ${invoice.number ?? "Number given when sent"}`}
      />
      <div className="flex max-w-3xl flex-col gap-6">
        {invoice.status === "draft" && (
          <p className="text-sm">
            Not sent yet. Making {formatMonth(month)} invoices again updates it
            with any lease changes.
          </p>
        )}
        {invoice.status === "draft" && canBill && early && (
          <p className="text-sm">{early}</p>
        )}
        {invoice.status === "draft" && canBill && !early && (
          <SendInvoiceForm
            invoiceId={invoice.id}
            tenantName={tenant.companyName}
            total={formatINR(invoice.grandTotal)}
            action={sendInvoice}
          />
        )}
        {invoice.status !== "draft" && invoice.sentAt && (
          <p className="text-sm text-muted-foreground">
            Sent on {formatDate(todayInIndia(invoice.sentAt))}
            {invoice.sentTo && invoice.sentTo.length > 0
              ? ` to ${invoice.sentTo.join(", ")}.`
              : ". The tenant had no email address then."}
          </p>
        )}
        {invoice.status !== "draft" &&
          invoice.status !== "cancelled" &&
          canBill && (
            <EmailAgainForm invoiceId={invoice.id} action={emailInvoiceAgain} />
          )}
        {(invoice.status === "sent" ||
          invoice.status === "part_paid" ||
          invoice.status === "overdue") &&
          canBill && (
            <Link
              href={`/billing/payments/new?tenant=${invoice.tenantId}`}
              className={buttonVariants({
                className: "h-11 self-start md:h-9",
              })}
            >
              Record payment
            </Link>
          )}
        <a
          href={`/billing/invoices/${invoice.id}/pdf`}
          target="_blank"
          rel="noopener"
          download={invoice.status === "draft" ? undefined : true}
          className={buttonVariants({
            variant: "outline",
            className: "h-11 self-start md:h-9",
          })}
        >
          {invoice.status === "draft" ? "Preview PDF" : "Download PDF"}
        </a>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Badge tone={status.tone}>{status.label}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Invoice date</dt>
            <dd className="tabular-nums">{formatDate(invoice.invoiceDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Due</dt>
            <dd className="tabular-nums">{formatDate(invoice.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-medium tabular-nums">
              {formatINR(invoice.grandTotal)}
            </dd>
          </div>
        </dl>

        <section className="flex flex-col gap-2">
          <h2 className="font-medium">What&apos;s billed</h2>
          <p className="text-sm text-muted-foreground">
            Tap a line, or the total, to see how it was worked out.
          </p>
          <ul className="flex flex-col divide-y rounded-lg border">
            {lines.map((l) => {
              const working = lineWorking(l.explanation);
              return (
                <li key={l.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-col gap-1 rounded-lg p-4 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                      <span className="flex items-start justify-between gap-4">
                        <span className="break-words">{l.description}</span>
                        <span className="flex items-center gap-1 tabular-nums">
                          {formatINR(l.taxableAmount)}
                          <Chevron />
                          <span className="sr-only">
                            : show how it was worked out
                          </span>
                        </span>
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {[
                          l.quantityLabel,
                          `GST ${formatINR(l.cgst + l.sgst + l.igst)}`,
                          `SAC ${l.sacCode}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </summary>
                    <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
                      {working ? (
                        <>
                          <Working explanation={working.amount} />
                          <Working explanation={working.tax} />
                        </>
                      ) : (
                        <p>
                          We can&apos;t show the working for this line.
                          {invoice.status === "draft"
                            ? ` Make ${formatMonth(month)} invoices again to work it out afresh.`
                            : " The amount is as it was sent."}
                        </p>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-1 text-sm">
          {totals.map(([label, amount]) => (
            <p key={label} className="flex justify-between gap-4">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums">{formatINR(amount)}</span>
            </p>
          ))}
          <details className="group border-t pt-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-2 font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <span>Total</span>
              <span className="flex items-center gap-1 tabular-nums">
                {formatINR(invoice.grandTotal)}
                <Chevron />
                <span className="sr-only">: show how it adds up</span>
              </span>
            </summary>
            <div className="pt-2">
              <Working explanation={totalWorking(invoice)} />
            </div>
          </details>
          {invoice.expectedTds > 0 && (
            <p className="flex justify-between gap-4 text-muted-foreground">
              <span>TDS the tenant may deduct</span>
              <span className="tabular-nums">
                {formatINR(invoice.expectedTds)}
              </span>
            </p>
          )}
        </section>

        {(credits.length > 0 ||
          (canBill &&
            invoice.status !== "draft" &&
            invoice.status !== "cancelled")) && (
          <section className="flex flex-col gap-2">
            <h2 className="font-medium">Credit notes</h2>
            {credits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None. To take money off this invoice (a mistake, a waiver or a
                discount), issue a credit note; the invoice itself never
                changes.
              </p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {credits.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">{c.number}</span>
                      <span className="break-words text-muted-foreground">
                        {formatDate(c.date)} · {CREDIT_REASONS[c.reason]}
                        {c.note ? `: ${c.note}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-4">
                      <span className="tabular-nums">
                        −{formatINR(c.total)}
                      </span>
                      <a
                        href={`/billing/credit-notes/${c.id}/pdf`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex min-h-11 items-center underline md:min-h-0"
                      >
                        PDF
                        <span className="sr-only">
                          {" "}
                          of credit note {c.number}
                        </span>
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canBill &&
              invoice.status !== "draft" &&
              invoice.status !== "cancelled" && (
                <Link
                  href={`/billing/invoices/${invoice.id}/credit-note`}
                  className={buttonVariants({
                    variant: "outline",
                    className: "h-11 self-start md:h-9",
                  })}
                >
                  Issue a credit note
                </Link>
              )}
          </section>
        )}

        {(reminders.length > 0 ||
          ["sent", "part_paid", "overdue"].includes(invoice.status)) && (
          <section className="flex flex-col gap-2">
            <h2 className="font-medium">Reminders</h2>
            {reminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {autoRemind
                  ? "No reminders sent yet. While this invoice is unpaid, the tenant gets an email on the days set in "
                  : "Automatic reminders are off for this tenant. Change that on the tenant's page or in "}
                <Link href="/settings/billing-rules" className="underline">
                  Billing rules
                </Link>
                .
              </p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {reminders.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">
                        {formatDate(todayInIndia(r.sentAt))} ·{" "}
                        {r.channel === "whatsapp_link"
                          ? "WhatsApp (opened)"
                          : reminderStepWords(r.step)}
                      </span>
                      <span className="break-words text-muted-foreground">
                        {r.status === "no_email" ? (
                          <>
                            Not sent. Add an email address on{" "}
                            <Link
                              href={`/tenants/${tenant.id}`}
                              className="underline"
                            >
                              the tenant&apos;s page
                            </Link>
                            .
                          </>
                        ) : r.channel === "whatsapp_link" ? (
                          `Opened in WhatsApp for ${r.sentTo.join(", ")}; you press Send there`
                        ) : (
                          `${REMINDER_STATUS[r.status]} ${r.sentTo.join(", ")}`
                        )}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatINR(r.amountAsked)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {whatsapp?.kind === "ready" && (
              <WhatsappReminderLink
                invoiceId={invoice.id}
                url={whatsapp.url}
                contactName={whatsapp.contactName}
              />
            )}
            {whatsapp?.kind === "no_number" && (
              <p className="text-sm text-muted-foreground">
                To remind {tenant.companyName} on WhatsApp, add a contact with a
                phone number and &ldquo;WhatsApp on this number&rdquo; on{" "}
                <Link href={`/tenants/${tenant.id}`} className="underline">
                  the tenant&apos;s page
                </Link>
                .
              </p>
            )}
          </section>
        )}
      </div>
    </>
  );
}

const REMINDER_STATUS = {
  sending: "Sending now to",
  sent: "Emailed to",
  failed: "Email failed. Check the address:",
} as const;

/** Points right when closed, down when its <details> is open. */
function Chevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 text-muted-foreground transition-transform group-open:rotate-90"
    >
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
