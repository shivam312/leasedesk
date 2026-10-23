"use server";

// Leases: the step form's review and save, renewal as a new version, and
// ending a lease early. Amounts on the review step come from the billing
// engine with the lease's resolved settings, exactly as they'll be billed.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { appDb, requireMember, type Member } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { PermissionError, requirePermission } from "@/lib/auth/roles";
import { compareDates, parseDate } from "@/lib/billing/dates";
import { updateLogged } from "@/lib/db/activity-log";
import { criticalDates, leaseCharges, leases } from "@/lib/db/schema";
import { runScoped } from "@/lib/db/scoped";
import { formatDate } from "@/lib/format";
import type { GeneratedCriticalDate } from "@/lib/leases/critical-dates";
import { checkLease } from "@/lib/leases/build";
import {
  parseLeaseForm,
  type LeaseFormErrors,
  type LeaseFormInput,
  type LeaseFormStep,
} from "@/lib/leases/draft";
import { createLease, getLease, markRenewed } from "@/lib/leases/queries";
import { renewalRefusal, renewalStartProblem } from "@/lib/leases/renewal";
import { reviewRows, type ReviewRow } from "@/lib/leases/review";
import { terminationPlan } from "@/lib/leases/termination";
import { todayInIndia } from "@/lib/today";

export type LeaseFormResult =
  | {
      ok: false;
      errors: LeaseFormErrors;
      step: LeaseFormStep;
      message?: string;
    }
  | {
      ok: true;
      rows: ReviewRow[];
      criticalDates: GeneratedCriticalDate[];
      rentCommencementDate: string;
      areaHundredths: number;
    };

const refused = (message: string): Extract<LeaseFormResult, { ok: false }> => ({
  ok: false,
  errors: {},
  step: "review",
  message,
});

async function memberWhoMayEdit(): Promise<Member | string> {
  const member = await requireMember();
  try {
    requirePermission(member, "manage_leases");
  } catch (error) {
    if (error instanceof PermissionError) return error.message;
    throw error;
  }
  return member;
}

function parsed(input: LeaseFormInput) {
  const result = parseLeaseForm(input);
  return result.ok ? result : { ...result, ok: false as const };
}

/** The review step: the full schedule and critical dates, nothing saved. */
export async function previewLease(
  input: LeaseFormInput,
  replacesLeaseId: string | null = null,
): Promise<LeaseFormResult> {
  const member = await memberWhoMayEdit();
  if (typeof member === "string") return refused(member);
  const form = parsed(input);
  if (!form.ok) return form;
  return runScoped(appDb, member, async (s) => {
    const result = await checkLease(s, form.draft, replacesLeaseId, {
      leaseId: "preview",
    });
    if (!result.ok) return result;
    return {
      ok: true,
      rows: reviewRows(result.built.lease, result.built.billing),
      criticalDates: result.dates,
      rentCommencementDate: result.built.rentCommencementDate,
      areaHundredths: result.built.areaHundredths,
    };
  });
}

/**
 * Save the lease. A renewal (`replacesLeaseId`) is a new version for the
 * same tenant; the old version becomes `renewed` and is never edited
 * otherwise.
 */
export async function saveLease(
  input: LeaseFormInput,
  replacesLeaseId: string | null = null,
): Promise<
  Extract<LeaseFormResult, { ok: false }> | { ok: "saved"; id: string }
> {
  const member = await memberWhoMayEdit();
  if (typeof member === "string") return refused(member);
  const form = parsed(input);
  if (!form.ok) return form;
  const { draft } = form;
  const leaseId = randomUUID();
  const today = todayInIndia();
  const outcome = await runScoped(appDb, member, async (s) => {
    let version = 1;
    if (replacesLeaseId) {
      const old = await getLease(s, replacesLeaseId);
      if (!old)
        return refused("The lease being renewed isn't in your account.");
      const refusal = renewalRefusal(old.lease.status);
      if (refusal) return refused(refusal);
      const overlap = renewalStartProblem(
        old.lease.endDate,
        draft.dates.startDate,
      );
      if (overlap)
        return {
          ok: false as const,
          step: "dates" as const,
          errors: { startDate: overlap },
        };
      if (old.lease.tenantId !== draft.parties.tenantId)
        return {
          ok: false as const,
          step: "parties" as const,
          errors: {
            tenantId:
              "A renewal is for the same tenant. For a new tenant, add a new lease.",
          },
        };
      version = old.lease.version + 1;
    }
    const result = await checkLease(s, draft, replacesLeaseId, {
      leaseId,
      chargeIds: draft.charges.map(() => randomUUID()),
    });
    if (!result.ok) return result;
    await createLease(
      s,
      result.built,
      {
        tenantId: draft.parties.tenantId,
        buildingId: draft.parties.buildingId,
        areaBasis: draft.parties.areaBasis,
        depositPaise: draft.depositPaise,
        settings: draft.settings,
        status:
          compareDates(draft.dates.endDate, today) < 0 ? "expired" : "active",
        version,
        replacesLeaseId,
      },
      result.dates,
    );
    if (replacesLeaseId) await markRenewed(s, replacesLeaseId);
    return null;
  });
  if (outcome) return outcome;
  revalidatePath("/leases", "layout");
  return { ok: "saved", id: leaseId };
}

function isPlainDate(s: string) {
  try {
    parseDate(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * End a lease early: the lease and its open charges end on the exit date,
 * later critical dates are closed. Sent invoices stay as they are; anything
 * billed past the exit date is refunded with a credit note (M4).
 */
export async function terminateLease(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const member = await memberWhoMayEdit();
  if (typeof member === "string") return { message: member };
  const exitDate = String(form.get("exitDate") ?? "").trim();
  if (!isPlainDate(exitDate))
    return {
      fieldErrors: { exitDate: "Enter the tenant's last day." },
      values: { exitDate },
    };
  const today = todayInIndia();
  const result = await runScoped(
    appDb,
    member,
    async (s): Promise<FormState | null> => {
      const lease = await getLease(s, id);
      if (!lease) return { message: "This lease isn't in your account." };
      let plan;
      try {
        plan = terminationPlan({
          lease: lease.lease,
          charges: lease.charges,
          criticalDates: lease.criticalDates,
          exitDate,
          today,
        });
      } catch (error) {
        return {
          fieldErrors: {
            exitDate: error instanceof Error ? error.message : String(error),
          },
          values: { exitDate },
        };
      }
      await updateLogged(s, leases, id, {
        endDate: plan.endDate,
        status: plan.status,
        // A lock-in can't outlast the lease.
        ...(lease.lease.lockInEndDate &&
        compareDates(lease.lease.lockInEndDate, plan.endDate) > 0
          ? { lockInEndDate: plan.endDate }
          : {}),
      });
      for (const c of plan.shortenCharges)
        await updateLogged(s, leaseCharges, c.id, { endDate: c.endDate });
      // A charge that would only start after the exit needs no change: the
      // engine bills only dates inside the lease, which now ends on the exit.
      // The expiry reminder moves to the exit date; the others after it close.
      const expiry = lease.criticalDates.find((d) => d.type === "expiry");
      for (const dateId of plan.closeCriticalDates)
        if (dateId !== expiry?.id)
          await updateLogged(s, criticalDates, dateId, {
            status: "done",
            snoozedUntil: null,
          });
      if (expiry)
        await updateLogged(s, criticalDates, expiry.id, {
          date: plan.endDate,
          status: plan.status === "terminated" ? "done" : "open",
          snoozedUntil: null,
        });
      return null;
    },
  );
  if (result) return result;
  revalidatePath(`/leases/${id}`);
  return {
    tone: "success",
    message: `The lease now ends on ${formatDate(exitDate)}. Billing stops after that day.`,
  };
}
