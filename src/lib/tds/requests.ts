// "Request from tenant" on a missing TDS certificate: one tap emails the
// tenant's billing contacts for that quarter's certificate, and records when
// they were asked (certificate_requests), shown on the TDS certificates page.
// The amount comes from the TDS records at the moment of asking (as the
// page works it out), never from the form.

import { and, desc, eq, gte } from "drizzle-orm";
import type { PlainDate } from "@/lib/billing/dates";
import { TAX_LABELS } from "@/lib/config/tax-labels";
import { insertLogged } from "@/lib/db/activity-log";
import { certificateRequests, organizations, tenants } from "@/lib/db/schema";
import {
  runScoped,
  type OrgContext,
  type Scoped,
  type Transactional,
} from "@/lib/db/scoped";
import { EmailError, type Email, type EmailDriver } from "@/lib/email";
import { formatDate, formatINR } from "@/lib/format";
import { recipientsFor } from "@/lib/invoices/send";
import { reportError } from "@/lib/monitoring";
import { trackerRecords } from "./certificates";
import { certificateDue, tdsTracker, type Quarter } from "./tracker";

/** The email asking for one quarter's certificate. Pure. */
export function certificateRequestEmail(input: {
  to: string[];
  tenantName: string;
  landlordName: string;
  financialYear: string;
  quarter: Quarter;
  amountPaise: number;
  due: PlainDate;
}): Email {
  const form = TAX_LABELS.tdsCertificate;
  const period = `Q${input.quarter} of FY ${input.financialYear}`;
  return {
    to: input.to,
    subject: `Please send your ${form} for ${period}`,
    text: [
      `Dear ${input.tenantName},`,
      "",
      `Our records show ${formatINR(input.amountPaise)} of TDS deducted from your rent payments to ${input.landlordName} in ${period}. The ${form} for it was due by ${formatDate(input.due)}, and we haven't received it yet.`,
      "",
      `Please download it from TRACES and reply to this email with the PDF.`,
      "",
      "Regards,",
      input.landlordName,
    ].join("\n"),
  };
}

export type RequestResult =
  | { kind: "sent"; to: string[]; amountPaise: number }
  | { kind: "no_email" }
  | { kind: "already_today" }
  /** No TDS that quarter, or its certificate is already in. */
  | { kind: "nothing_missing" }
  | { kind: "failed"; message: string };

export async function requestCertificate(
  db: Transactional,
  ctx: OrgContext,
  input: {
    tenantId: string;
    financialYear: string;
    quarter: Quarter;
  },
  today: PlainDate,
  driver: EmailDriver,
): Promise<RequestResult | null> {
  const prepared = await runScoped(db, ctx, async (s) => {
    const [tenant] = await s.tx
      .select({ name: tenants.companyName })
      .from(tenants)
      .where(s.where(tenants, eq(tenants.id, input.tenantId)));
    if (!tenant) return null;
    // The quarter's TDS per our records now, and whether its certificate
    // is still missing.
    const cell = tdsTracker({
      financialYear: input.financialYear,
      today,
      records: await trackerRecords(s, input.financialYear),
    })
      .rows.find((r) => r.tenantId === input.tenantId)
      ?.quarters.find((q) => q.quarter === input.quarter);
    if (!cell || cell.status === "none" || cell.status === "received")
      return { nothing: true as const };
    const [asked] = await s.tx
      .select({ id: certificateRequests.id })
      .from(certificateRequests)
      .where(
        s.where(
          certificateRequests,
          and(
            eq(certificateRequests.tenantId, input.tenantId),
            eq(certificateRequests.financialYear, input.financialYear),
            eq(certificateRequests.quarter, input.quarter),
            eq(certificateRequests.status, "sent"),
            gte(
              certificateRequests.createdAt,
              new Date(`${today}T00:00:00+05:30`),
            ),
          ),
        ),
      );
    if (asked) return { already: true as const };
    const [org] = await s.tx
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, s.organizationId));
    return {
      already: false as const,
      tenantName: tenant.name,
      landlordName: org?.name ?? "",
      to: await recipientsFor(s, input.tenantId),
      amountPaise: cell.amount,
    };
  });
  if (!prepared) return null;
  if ("nothing" in prepared) return { kind: "nothing_missing" };
  if (prepared.already) return { kind: "already_today" };
  let result: RequestResult;
  if (prepared.to.length === 0) result = { kind: "no_email" };
  else {
    try {
      await driver.send(
        certificateRequestEmail({
          to: prepared.to,
          tenantName: prepared.tenantName,
          landlordName: prepared.landlordName,
          financialYear: input.financialYear,
          quarter: input.quarter,
          amountPaise: prepared.amountPaise,
          due: certificateDue(input.financialYear, input.quarter),
        }),
      );
      result = {
        kind: "sent",
        to: prepared.to,
        amountPaise: prepared.amountPaise,
      };
    } catch (error) {
      reportError("Certificate request email failed", error, {
        tenantId: input.tenantId,
      });
      result = {
        kind: "failed",
        message:
          error instanceof EmailError
            ? error.message
            : "The email couldn't be sent.",
      };
    }
  }
  await runScoped(db, ctx, (s) =>
    insertLogged(s, certificateRequests, {
      tenantId: input.tenantId,
      financialYear: input.financialYear,
      quarter: input.quarter,
      sentTo: prepared.to,
      status: result.kind,
      requestedBy: s.userId,
    }),
  );
  return result;
}

/** When each tenant was last asked for each quarter's certificate in a year: "tenantId|quarter" → date. */
export async function lastRequests(
  s: Scoped,
  financialYear: string,
): Promise<Map<string, Date>> {
  const rows = await s.tx
    .select({
      tenantId: certificateRequests.tenantId,
      quarter: certificateRequests.quarter,
      at: certificateRequests.createdAt,
    })
    .from(certificateRequests)
    .where(
      s.where(
        certificateRequests,
        and(
          eq(certificateRequests.financialYear, financialYear),
          eq(certificateRequests.status, "sent"),
        ),
      ),
    )
    .orderBy(desc(certificateRequests.createdAt));
  const map = new Map<string, Date>();
  for (const r of rows) {
    const k = `${r.tenantId}|${r.quarter}`;
    if (!map.has(k)) map.set(k, r.at);
  }
  return map;
}
