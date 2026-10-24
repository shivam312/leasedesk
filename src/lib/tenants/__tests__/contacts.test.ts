import { describe, expect, it } from "vitest";
import {
  contactsChangeProblem,
  nextPrimary,
  receivesInvoices,
  type ContactRow,
} from "../contacts";

const c = (o: Partial<ContactRow> & { id: string }): ContactRow => ({
  name: o.id,
  email: `${o.id}@acme.example`,
  role: "billing",
  isPrimary: false,
  ...o,
});

describe("receivesInvoices", () => {
  it("is every Accounts contact with an email", () => {
    const all = [
      c({ id: "a" }),
      c({ id: "b", role: "legal" }),
      c({ id: "d", email: null }),
    ];
    expect(all.map((x) => receivesInvoices(x, all))).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("falls back to the main contact when no Accounts contact has an email", () => {
    const all = [
      c({ id: "a", role: "admin", isPrimary: true }),
      c({ id: "b", role: "legal" }),
    ];
    expect(all.map((x) => receivesInvoices(x, all))).toEqual([true, false]);
  });
});

describe("contactsChangeProblem", () => {
  const before = [
    c({ id: "a", isPrimary: true }),
    c({ id: "b", role: "legal" }),
  ];

  it("refuses a change that leaves no email for invoices", () => {
    // Removing a, the only Accounts contact; b is Legal and not main.
    expect(contactsChangeProblem(before, [before[1]!])).toMatch(/no email/);
    // Clearing a's email.
    expect(
      contactsChangeProblem(before, [
        { ...before[0]!, email: null },
        before[1]!,
      ]),
    ).toMatch(/no email/);
  });

  it("allows it when another contact still gets invoices", () => {
    const after = [{ ...before[1]!, role: "billing" as const }];
    expect(contactsChangeProblem(before, after)).toBeNull();
  });

  it("doesn't stand in the way when there was no invoice email to begin with", () => {
    const none = [c({ id: "a", email: null })];
    expect(contactsChangeProblem(none, [])).toBeNull();
  });
});

describe("nextPrimary", () => {
  it("prefers a contact with an email", () => {
    expect(nextPrimary([c({ id: "x", email: null }), c({ id: "y" })])).toBe(
      "y",
    );
    expect(nextPrimary([c({ id: "x", email: null })])).toBe("x");
    expect(nextPrimary([])).toBeNull();
  });
});
