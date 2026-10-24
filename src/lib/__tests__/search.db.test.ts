import { afterAll, describe, expect, it } from "vitest";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { globalSearch, likePattern } from "../search";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

describe("likePattern", () => {
  it("escapes LIKE's wildcards and ignores a blank search", () => {
    expect(likePattern(" 50%_off ")).toBe("%50\\%\\_off%");
    expect(likePattern("  ")).toBeNull();
  });
});

describe.skipIf(skipDbTests)("global search", () => {
  afterAll(closeDb);

  it("finds the organization's own tenants and units, never another's", () =>
    inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      const b = await seedOrg(tx, "b");
      const find = (org: typeof a, q: string) =>
        runScoped(
          asDb(tx),
          { userId: org.userId, organizationId: org.org.id },
          (s) => globalSearch(s, q),
        );
      const mine = await find(a, a.tenant.companyName.slice(0, 4));
      expect(mine.tenants.map((t) => t.id)).toContain(a.tenant.id);
      expect(mine.tenants.map((t) => t.id)).not.toContain(b.tenant.id);
      const unitHits = await find(a, a.unit.code);
      expect(unitHits.units.map((u) => u.id)).toEqual([a.unit.id]);
    }));
});
