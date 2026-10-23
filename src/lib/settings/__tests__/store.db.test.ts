import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { seedOrg, type Role } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import * as schema from "@/lib/db/schema";
import { runScoped, type Scoped, type Transactional } from "@/lib/db/scoped";
import { loadSettings, loadSettingsWithSources, saveSettings } from "../store";

async function asMember(
  tx: TestTx,
  role: Role,
  fn: (s: Scoped, org: Awaited<ReturnType<typeof seedOrg>>) => Promise<void>,
) {
  const org = await seedOrg(tx, "a", role);
  await runScoped(
    tx as unknown as Transactional,
    { userId: org.userId, organizationId: org.org.id },
    (s) => fn(s, org),
  );
}

describe.skipIf(skipDbTests)("settings storage", () => {
  afterAll(closeDb);

  it("saves overrides on each level and resolves lease → tenant → building → organization", async () => {
    await inRollback(async (tx) =>
      asMember(tx, "owner", async (s, { building, tenant, entity }) => {
        await saveSettings(
          s,
          { scope: "organization" },
          {
            "invoice.runDay": 25,
            "billing.roundIncreasedRent": "none",
          },
        );
        await saveSettings(
          s,
          { scope: "building", id: building.id },
          {
            "invoice.dueDays": 10,
            "billing.roundIncreasedRent": "rupee",
          },
        );
        await saveSettings(
          s,
          { scope: "tenant", id: tenant.id },
          {
            "invoice.dueDays": 15,
          },
        );
        await saveSettings(
          s,
          { scope: "billing_entity", id: entity.id },
          {
            "invoice.numberFormat": "{prefix}-{fy}-{seq}",
          },
        );

        const settings = await loadSettings(s, {
          buildingId: building.id,
          tenantId: tenant.id,
          billingEntityId: entity.id,
          leaseSettings: { "billing.roundIncreasedRent": "none" },
        });
        expect(settings["invoice.runDay"]).toBe(25);
        expect(settings["invoice.dueDays"]).toBe(15);
        expect(settings["billing.roundIncreasedRent"]).toBe("none");
        expect(settings["invoice.numberFormat"]).toBe("{prefix}-{fy}-{seq}");

        const forBuilding = await loadSettingsWithSources(s, {
          buildingId: building.id,
        });
        expect(forBuilding["invoice.dueDays"]).toEqual({
          value: 10,
          source: "building",
        });
        expect(forBuilding["billing.roundIncreasedRent"].source).toBe(
          "building",
        );
      }),
    );
  });

  it("at organization level, stores only values that differ from the default", async () => {
    await inRollback(async (tx) =>
      asMember(tx, "owner", async (s) => {
        const stored = await saveSettings(
          s,
          { scope: "organization" },
          {
            "invoice.runDay": 1,
            "gst.rounding": "per_invoice",
          },
        );
        expect(stored).toEqual({ "gst.rounding": "per_invoice" });
      }),
    );
  });

  it("at building level, keeps a value equal to the default (set here), and logs the change", async () => {
    await inRollback(async (tx) =>
      asMember(tx, "owner", async (s, { building }) => {
        await saveSettings(
          s,
          { scope: "building", id: building.id },
          { "invoice.dueDays": 7, "gst.defaultRateBp": 1200 },
        );
        const [row] = await s.tx
          .select({ settings: schema.buildings.settings })
          .from(schema.buildings)
          .where(eq(schema.buildings.id, building.id));
        expect(row?.settings).toEqual({
          "invoice.dueDays": 7,
          "gst.defaultRateBp": 1200,
        });
        const log = await s.tx
          .select()
          .from(schema.activityLog)
          .where(eq(schema.activityLog.entityId, building.id));
        expect(log).toHaveLength(1);
        expect(log[0]?.after?.settings).toMatchObject({
          "gst.defaultRateBp": 1200,
        });
      }),
    );
  });

  it("refuses a setting that doesn't belong to the level", async () => {
    await inRollback(async (tx) =>
      asMember(tx, "owner", async (s, { tenant }) => {
        await expect(
          saveSettings(
            s,
            { scope: "tenant", id: tenant.id },
            {
              "invoice.runDay": 25,
            },
          ),
        ).rejects.toThrow(/Invalid tenant settings/);
      }),
    );
  });

  it("a viewer can't change organization settings", async () => {
    await inRollback(async (tx) =>
      asMember(tx, "viewer", async (s) => {
        await expect(
          saveSettings(s, { scope: "organization" }, { "invoice.runDay": 25 }),
        ).rejects.toThrow(/Only an owner/);
      }),
    );
  });
});
