"use server";

// Buildings, floors and units.

import { eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "next/navigation";
import { appDb } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { insertLogged, updateLogged } from "@/lib/db/activity-log";
import { buildings, floors, units } from "@/lib/db/schema";
import { runScoped } from "@/lib/db/scoped";
import { sameGstinEntityIds } from "@/lib/property/queries";
import {
  buildingSchema,
  floorSchema,
  prefixClash,
  unitSchema,
} from "@/lib/property/forms";
import { planPropertyImport } from "@/lib/imports/property";
import { pastedUnitsSheet } from "@/lib/imports/paste-units";
import { existingProperty, saveProperty } from "@/lib/imports/save-property";
import { guardedForm } from "./guard";

/** Postgres unique violation: a duplicate unit code or floor label. */
function isDuplicate(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } })?.cause;
  return cause?.code === "23505";
}

export async function saveBuilding(
  id: string | null,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  let savedId: string | null = null;
  const result = await guardedForm(
    "manage_property",
    buildingSchema,
    form,
    (member, data) =>
      runScoped(appDb, member, async (s) => {
        // Every other building under the same GSTIN, whichever billing
        // entity carries it: numbers are unique per GSTIN (section 9).
        const sameGstin = await sameGstinEntityIds(s, data.billingEntityId);
        const others = await s.tx
          .select({
            invoicePrefix: buildings.invoicePrefix,
            creditNotePrefix: buildings.creditNotePrefix,
          })
          .from(buildings)
          .where(
            s.where(
              buildings,
              inArray(buildings.billingEntityId, sameGstin),
              id ? ne(buildings.id, id) : undefined,
            ),
          );
        const clash = prefixClash(data, others);
        if (clash) return { fieldErrors: clash, values: data };
        const saved = id
          ? await updateLogged(s, buildings, id, data)
          : await insertLogged(s, buildings, data);
        if (!saved) return { message: "This building isn't in your account." };
        savedId = saved.id;
        return {};
      }),
  ).catch((error: unknown) => {
    // A billing entity from another organization fails the foreign key.
    if ((error as { cause?: { code?: string } })?.cause?.code === "23503")
      return { message: "Choose a GSTIN from your business details." };
    throw error;
  });
  if (savedId) {
    revalidatePath("/leases", "layout");
    redirect(`/leases/buildings/${savedId}`);
  }
  return result;
}

export async function addFloor(
  buildingId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm("manage_property", floorSchema, form, (member, data) =>
    runScoped(appDb, member, async (s) => {
      try {
        await s.tx.transaction(async (t) => {
          const existing = await t.$count(
            floors,
            s.where(floors, eq(floors.buildingId, buildingId)),
          );
          await insertLogged({ ...s, tx: t }, floors, {
            ...data,
            buildingId,
            sortOrder: existing,
          });
        });
      } catch (error) {
        if (isDuplicate(error))
          return {
            message: `There's already a floor called ${data.label}.`,
            values: data,
          };
        throw error;
      }
      revalidatePath(`/leases/buildings/${buildingId}`);
      return { tone: "success", message: `Added ${data.label}.` };
    }),
  );
}

export async function saveUnit(
  buildingId: string,
  unitId: string | null,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  let done = false;
  const result = await guardedForm(
    "manage_property",
    unitSchema,
    form,
    (member, data) =>
      runScoped(appDb, member, async (s) => {
        try {
          const saved = await s.tx.transaction((t) =>
            unitId
              ? updateLogged({ ...s, tx: t }, units, unitId, data)
              : insertLogged({ ...s, tx: t }, units, { ...data, buildingId }),
          );
          if (!saved) return { message: "This unit isn't in your account." };
        } catch (error) {
          if (isDuplicate(error))
            return {
              fieldErrors: {
                code: `Unit ${data.code} already exists in this building.`,
              },
              values: Object.fromEntries(
                [...form.entries()].map(([k, v]) => [k, String(v)]),
              ),
            };
          throw error;
        }
        done = true;
        return {};
      }),
  );
  if (done) {
    revalidatePath("/leases", "layout");
    redirect(`/leases/buildings/${buildingId}`);
  }
  return result;
}

/** "Paste units from Excel": the rows, checked and saved as the Excel import does. */
export async function pasteUnits(
  buildingId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_property",
    z.object({
      rows: z
        .string()
        .trim()
        .min(1, "Paste the rows copied from Excel: unit, floor, carpet area.")
        .max(200_000),
    }),
    form,
    (member, { rows }) =>
      runScoped(appDb, member, async (s) => {
        const existing = await existingProperty(s);
        const building = existing.buildings.find((b) => b.id === buildingId);
        if (!building)
          return { message: "This building isn't in your account." };
        const result = planPropertyImport(
          [pastedUnitsSheet(rows, building.name)],
          existing,
        );
        if ("errors" in result)
          return {
            fieldErrors: {
              rows: result.errors
                .slice(0, 5)
                .map((e) => `Line ${Math.max(e.row - 1, 1)}: ${e.message}`)
                .join(" "),
            },
            values: { rows },
          };
        if (result.plan.units.length === 0)
          return {
            fieldErrors: { rows: "No units in what you pasted." },
            values: { rows },
          };
        await saveProperty(s, result.plan);
        revalidatePath(`/leases/buildings/${buildingId}`);
        const n = result.plan.units.length;
        return {
          tone: "success",
          message: `Added ${n} ${n === 1 ? "unit" : "units"}.`,
        };
      }),
  );
}
