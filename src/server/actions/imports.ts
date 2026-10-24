"use server";

// Excel imports (Leases → Import from Excel). The file is read here; nothing
// is saved unless every row is right, and then everything is saved in one
// transaction, each row logged.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appDb } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import type { FormState } from "@/lib/auth/forms";
import { parseWorkbookSheets } from "@/lib/bank/xlsx";
import { runScoped } from "@/lib/db/scoped";
import { planPropertyImport } from "@/lib/imports/property";
import { existingProperty, saveProperty } from "@/lib/imports/save-property";
import { ImportRefused, importTenancy } from "@/lib/imports/save-tenancy";
import { todayInIndia } from "@/lib/today";
import type { RowError, Sheet } from "@/lib/imports/sheets";
import { guardedForm } from "./guard";

const MAX_BYTES = 2 * 1024 * 1024;

async function readFile(
  form: FormData,
): Promise<{ sheets: Sheet[] } | { message: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { message: "Choose the Excel file to import." };
  if (file.size > MAX_BYTES)
    return {
      message:
        "This file is over 2 MB. Split it into smaller files and import them one at a time.",
    };
  try {
    return { sheets: parseWorkbookSheets(await file.arrayBuffer()) };
  } catch {
    return {
      message:
        "This isn't an Excel file we can read. Save it as .xlsx and try again.",
    };
  }
}

const SHOWN = 50;

/** "Units, row 7: …", at most 50. */
function problemLines(errors: RowError[]): string[] {
  return errors
    .slice(0, SHOWN)
    .map((e) =>
      e.row > 0 ? `${e.sheet}, row ${e.row}: ${e.message}` : e.message,
    );
}

/** The lead sentence above the rows to fix. */
function refusedMessage(errors: RowError[]): string {
  const n = errors.length;
  return n === 1
    ? "Nothing was imported. Fix this row in the file, then import it again."
    : n > SHOWN
      ? `Nothing was imported. Fix these rows in the file, then import it again. Showing the first ${SHOWN} of ${n}.`
      : `Nothing was imported. Fix these ${n} rows in the file, then import it again.`;
}

export async function importProperty(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm("manage_property", z.unknown(), form, async (member) => {
    const read = await readFile(form);
    if ("message" in read) return { message: read.message };
    return runScoped(appDb, member, async (s) => {
      const result = planPropertyImport(read.sheets, await existingProperty(s));
      if ("errors" in result)
        return {
          message: refusedMessage(result.errors),
          problems: problemLines(result.errors),
        };
      const n = await saveProperty(s, result.plan);
      revalidatePath("/leases", "layout");
      return {
        tone: "success",
        message: `Imported ${n.buildings} ${n.buildings === 1 ? "building" : "buildings"} and ${n.units} ${n.units === 1 ? "unit" : "units"}${n.floors > 0 ? `, with ${n.floors} new ${n.floors === 1 ? "floor" : "floors"}` : ""}.`,
      };
    });
  });
}

/** Tenants and leases: the lease checks need the units' buildings saved first. */
export async function importTenantsAndLeases(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm("manage_leases", z.unknown(), form, async (member) => {
    const read = await readFile(form);
    if ("message" in read) return { message: read.message };
    try {
      const n = await runScoped(appDb, member, (s) =>
        importTenancy(s, read.sheets, todayInIndia(), {
          canSetOpening: can(member.role, "manage_billing"),
        }),
      );
      revalidatePath("/leases", "layout");
      revalidatePath("/tenants", "layout");
      revalidatePath("/today");
      return {
        tone: "success",
        message: `Imported ${n.tenants} ${n.tenants === 1 ? "tenant" : "tenants"} and ${n.leases} ${n.leases === 1 ? "lease" : "leases"}. Check one lease's rent schedule before making this month's invoices.`,
      };
    } catch (error) {
      if (!(error instanceof ImportRefused)) throw error;
      return {
        message: refusedMessage(error.errors),
        problems: problemLines(error.errors),
      };
    }
  });
}
