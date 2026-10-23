// Importing tenants and leases inside the caller's one transaction. Rows are
// saved as they are checked, so a later lease sees the units an earlier one
// took; if any row has a problem, everything is undone (ImportRefused) and
// the problems are listed (D40).

import { randomUUID } from "node:crypto";
import { compareDates, type PlainDate } from "@/lib/billing/dates";
import { insertLogged } from "@/lib/db/activity-log";
import { buildings, tenantContacts, tenants, units } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { checkLease } from "@/lib/leases/build";
import { parseLeaseForm } from "@/lib/leases/draft";
import { createLease } from "@/lib/leases/queries";
import {
  findSheet,
  readRows,
  sortErrors,
  type RowError,
  type Sheet,
} from "./sheets";
import {
  LEASE_COLUMNS,
  leaseErrorMessage,
  leaseRowInput,
  readTenantRow,
  rentTodayProblem,
  TENANT_COLUMNS,
} from "./tenancy";

/** Thrown to roll the transaction back; carries the rows to fix. */
export class ImportRefused extends Error {
  constructor(readonly errors: RowError[]) {
    super("Import refused");
  }
}

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function importTenancy(
  s: Scoped,
  sheets: readonly Sheet[],
  today: PlainDate,
): Promise<{ tenants: number; leases: number }> {
  const tenantSheet = findSheet(sheets, "Tenants");
  const leaseSheet = findSheet(sheets, "Leases");
  if (!tenantSheet && !leaseSheet)
    throw new ImportRefused([
      {
        sheet: "File",
        row: 0,
        message:
          'This file has no "Tenants" or "Leases" sheet. Download the template and copy your rows into it.',
      },
    ]);
  const errors: RowError[] = [];
  const tenantIds = new Map(
    (
      await s.tx
        .select({ id: tenants.id, name: tenants.companyName })
        .from(tenants)
        .where(s.where(tenants))
    ).map((t) => [key(t.name), t.id]),
  );
  // Tenants whose own row has a problem: their leases wait for that fix.
  const failed = new Set<string>();
  let tenantCount = 0;
  if (tenantSheet) {
    const read = readRows(tenantSheet, TENANT_COLUMNS);
    if ("error" in read) errors.push(read.error);
    else
      for (const { row, values } of read.rows) {
        const err = (message: string) => {
          errors.push({ sheet: tenantSheet.name, row, message });
          failed.add(key(values.name));
        };
        if (tenantIds.has(key(values.name))) {
          // The tenant exists, so its leases are still checked.
          errors.push({
            sheet: tenantSheet.name,
            row,
            message: `${values.name} is already saved, or is in the Tenants sheet twice. Take the extra row out; its leases can still be in the Leases sheet.`,
          });
          continue;
        }
        const parsed = readTenantRow(values);
        if ("error" in parsed) {
          err(parsed.error);
          continue;
        }
        const saved = await insertLogged(s, tenants, parsed.tenant);
        await insertLogged(s, tenantContacts, {
          ...parsed.contact,
          tenantId: saved.id,
          isPrimary: true,
        });
        tenantIds.set(key(values.name), saved.id);
        tenantCount++;
      }
  }

  let leaseCount = 0;
  if (leaseSheet) {
    const read = readRows(leaseSheet, LEASE_COLUMNS);
    if ("error" in read) errors.push(read.error);
    else {
      const [buildingRows, unitRows] = await Promise.all([
        s.tx
          .select({ id: buildings.id, name: buildings.name })
          .from(buildings)
          .where(s.where(buildings)),
        s.tx
          .select({
            id: units.id,
            buildingId: units.buildingId,
            code: units.code,
          })
          .from(units)
          .where(s.where(units)),
      ]);
      const lookup = {
        tenantId: (name: string) => tenantIds.get(key(name)) ?? null,
        building: (name: string) => {
          const b = buildingRows.find((r) => key(r.name) === key(name));
          if (!b) return null;
          return {
            id: b.id,
            unitId: (code: string) =>
              unitRows.find(
                (u) => u.buildingId === b.id && key(u.code) === key(code),
              )?.id ?? null,
          };
        },
      };
      for (const { row, values } of read.rows) {
        const err = (message: string) =>
          errors.push({ sheet: leaseSheet.name, row, message });
        if (failed.has(key(values.tenant))) continue;
        const mapped = leaseRowInput(values, lookup);
        if ("error" in mapped) {
          err(mapped.error);
          continue;
        }
        const form = parseLeaseForm(mapped.input);
        if (!form.ok) {
          err(leaseErrorMessage(form.errors, mapped.sources));
          continue;
        }
        const draft = form.draft;
        const leaseId = randomUUID();
        const checked = await checkLease(s, draft, null, {
          leaseId,
          chargeIds: draft.charges.map(() => randomUUID()),
        });
        if (!checked.ok) {
          err(
            checked.message ??
              leaseErrorMessage(checked.errors, mapped.sources),
          );
          continue;
        }
        const rentToday = rentTodayProblem(
          checked.built.lease,
          checked.built.billing,
          values.rentToday,
          today,
        );
        if (rentToday) {
          err(rentToday);
          continue;
        }
        await createLease(
          s,
          checked.built,
          {
            tenantId: draft.parties.tenantId,
            buildingId: draft.parties.buildingId,
            areaBasis: draft.parties.areaBasis,
            depositPaise: draft.depositPaise,
            settings: draft.settings,
            status:
              compareDates(draft.dates.endDate, today) < 0
                ? "expired"
                : "active",
            version: 1,
            replacesLeaseId: null,
          },
          checked.dates,
        );
        leaseCount++;
      }
    }
  }
  if (errors.length > 0) throw new ImportRefused(sortErrors(errors));
  if (tenantCount === 0 && leaseCount === 0)
    throw new ImportRefused([
      {
        sheet: "File",
        row: 0,
        message: "The sheets have headings but no rows to import.",
      },
    ]);
  return { tenants: tenantCount, leases: leaseCount };
}
