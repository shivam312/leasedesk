// The supplier and tenant details printed on an invoice. A sent invoice keeps
// a copy made at sending (D18), so later edits to the business or tenant don't
// change it; a draft shows the current details.

import type {
  billingEntities,
  RecipientCopy,
  SupplierCopy,
  tenants,
} from "@/lib/db/schema";

type Entity = Pick<
  typeof billingEntities.$inferSelect,
  | "legalName"
  | "gstin"
  | "stateCode"
  | "address"
  | "bankName"
  | "bankAccountName"
  | "bankAccountNumber"
  | "ifsc"
  | "upiId"
>;
type Tenant = Pick<
  typeof tenants.$inferSelect,
  "companyName" | "gstin" | "billingAddress" | "stateCode"
>;

export function supplierCopy(e: Entity): SupplierCopy {
  return {
    legalName: e.legalName,
    gstin: e.gstin,
    stateCode: e.stateCode,
    address: e.address,
    bankName: e.bankName,
    bankAccountName: e.bankAccountName,
    bankAccountNumber: e.bankAccountNumber,
    ifsc: e.ifsc,
    upiId: e.upiId,
  };
}

export function recipientCopy(t: Tenant, property: string): RecipientCopy {
  return {
    companyName: t.companyName,
    gstin: t.gstin,
    billingAddress: t.billingAddress,
    stateCode: t.stateCode,
    property,
  };
}

/** "Tower A, MG Road, Pune · Units 401, 402": where the supply is. */
export function propertyLine(
  building: { name: string; address: string; city: string },
  unitCodes: string[],
): string {
  const units = [...unitCodes].sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true }),
  );
  const place = [building.name, building.address, building.city]
    .filter(Boolean)
    .join(", ");
  if (units.length === 0) return place;
  return `${place} · ${units.length === 1 ? "Unit" : "Units"} ${units.join(", ")}`;
}

export type { Entity as SupplierSource, Tenant as RecipientSource };
