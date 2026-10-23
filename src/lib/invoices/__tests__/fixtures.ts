// A sent invoice for the pure invoice tests: ₹1,00,000 rent + 18% GST.

import type { DocumentSource } from "../document";

export function source(
  over: Partial<DocumentSource["invoice"]> = {},
): DocumentSource {
  return {
    invoice: {
      status: "sent",
      number: "B1/26-27/0001",
      invoiceDate: "2026-11-01",
      dueDate: "2026-11-08",
      placeOfSupply: "27",
      supplyType: "intra_state",
      // ₹1,00,000 rent + 18% = ₹9,000 CGST + ₹9,000 SGST
      taxableTotal: 10000000,
      cgstTotal: 900000,
      sgstTotal: 900000,
      igstTotal: 0,
      roundOff: 0,
      grandTotal: 11800000,
      // 10% TDS on rent: ₹10,000
      expectedTds: 1000000,
      supplier: {
        legalName: "Demo Properties LLP",
        gstin: "27AAPFU0939F1ZV",
        stateCode: "27",
        address: "1 MG Road, Pune",
        bankName: "HDFC Bank",
        bankAccountName: "Demo Properties LLP",
        bankAccountNumber: "50100012345678",
        ifsc: "HDFC0000123",
        upiId: "demo@okhdfcbank",
      },
      recipient: {
        companyName: "Acme Tech Pvt Ltd",
        gstin: "27AABCA1234A1Z5",
        billingAddress: "Unit 401, Tower A, Pune",
        stateCode: "27",
        property: "Tower A, MG Road, Pune · Units 401, 402",
      },
      ...over,
    },
    tenant: {
      companyName: "Acme (renamed later)",
      gstin: null,
      billingAddress: "New address",
      stateCode: "29",
    },
    entity: {
      legalName: "Demo Properties (renamed later)",
      gstin: "27AAPFU0939F1ZV",
      stateCode: "27",
      address: "New office",
      bankName: null,
      bankAccountName: null,
      bankAccountNumber: null,
      ifsc: null,
      upiId: null,
    },
    building: {
      name: "Tower A (renamed later)",
      address: "MG Road",
      city: "Pune",
    },
    unitCodes: ["402", "401", "10"],
    lines: [
      {
        position: 1,
        description: "Rent for Nov 2026",
        sacCode: "997212",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        quantityLabel: null,
        taxableAmount: 10000000,
        gstRateBp: 1800,
        cgst: 900000,
        sgst: 900000,
        igst: 0,
      },
    ],
  };
}
