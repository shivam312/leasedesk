// Settings → Export all data (M10): one zip with an Excel file per table
// (the organization, its businesses with their GSTIN and bank details,
// buildings, units, tenants, leases, invoices and their lines, credit notes,
// payments, deposits, TDS, opening balances) and every stored PDF and
// document, so a landlord can take their data with them. Values are exactly
// as stored (D57): amounts in paise, areas in hundredths of a sq ft, rates
// in basis points, with a "Read me" saying so. Owner only; logged.

import { strToU8, zipSync, type Zippable } from "fflate";
import { eq } from "drizzle-orm";
import { utils, write } from "xlsx";
import type { PgTable } from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { PlainDate } from "@/lib/billing/dates";
import { logActivity } from "@/lib/db/activity-log";
import {
  billingEntities,
  buildings,
  creditNoteLines,
  creditNotes,
  criticalDates,
  customEscalations,
  escalationRules,
  depositEntries,
  documents,
  floors,
  invoiceLines,
  invoices,
  leaseCharges,
  leases,
  leaseUnits,
  openingBalances,
  organizations,
  paymentAllocations,
  payments,
  tdsRecords,
  tenantContacts,
  tenants,
  units,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import type { FileStore } from "@/lib/files/store";

type OrgTable = PgTable & { organizationId: PgColumn };

/** File name in the zip → table. Order is the order in the zip. */
const TABLES: [string, OrgTable][] = [
  ["businesses", billingEntities],
  ["buildings", buildings],
  ["floors", floors],
  ["units", units],
  ["tenants", tenants],
  ["tenant contacts", tenantContacts],
  ["leases", leases],
  ["lease units", leaseUnits],
  ["lease charges", leaseCharges],
  ["rent increases", escalationRules],
  ["custom rent increases", customEscalations],
  ["lease dates", criticalDates],
  ["invoices", invoices],
  ["invoice lines", invoiceLines],
  ["credit notes", creditNotes],
  ["credit note lines", creditNoteLines],
  ["payments", payments],
  ["payment allocations", paymentAllocations],
  ["opening balances", openingBalances],
  ["deposits", depositEntries],
  ["tds", tdsRecords],
  ["documents", documents],
];

export type ExportTable = { name: string; rows: Record<string, unknown>[] };
export type ExportFile = { path: string; bytes: Uint8Array };

export const README = [
  "LeaseDesk: all your data",
  "",
  "One Excel file per kind of record, with every column as LeaseDesk stores it:",
  "- Amounts are in paise: divide by 100 for rupees (12345678 is ₹1,23,456.78).",
  "- Areas are in hundredths of a sq ft: divide by 100 (125050 is 1,250.50 sq ft).",
  "- Rates and percentages are in basis points: divide by 100 (1800 is 18%).",
  "- Dates are YYYY-MM-DD. Each row's id links it to other files (tenant_id, lease_id, invoice_id).",
  "",
  "The files folder has every invoice PDF as it was sent and every document you uploaded.",
].join("\n");

/** snake_case headers, as in docs/DATA_MODEL.md; dates and big numbers as they are. */
function sheetRows(rows: Record<string, unknown>[]) {
  return rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [
        k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
        v instanceof Date
          ? v.toISOString()
          : Array.isArray(v) || (v !== null && typeof v === "object")
            ? JSON.stringify(v)
            : v,
      ]),
    ),
  );
}

/** The zip: Read me, one .xlsx per table, and the files. Pure. */
export function allDataZip(
  tables: readonly ExportTable[],
  files: readonly ExportFile[],
): Uint8Array {
  const zip: Zippable = { "Read me.txt": strToU8(README) };
  for (const t of tables) {
    const book = utils.book_new();
    const sheet =
      t.rows.length > 0
        ? utils.json_to_sheet(sheetRows(t.rows))
        : utils.aoa_to_sheet([["No rows"]]);
    utils.book_append_sheet(book, sheet, t.name.slice(0, 31));
    zip[`${t.name}.xlsx`] = new Uint8Array(
      write(book, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer,
    );
  }
  for (const f of files) zip[`files/${f.path}`] = [f.bytes, { level: 0 }];
  return zipSync(zip, { level: 6 });
}

/** Every table's rows for this organization. */
export async function allDataTables(s: Scoped): Promise<ExportTable[]> {
  // The organization row itself is keyed by id, not organization_id.
  const out: ExportTable[] = [
    {
      name: "organization",
      rows: (await s.tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, s.organizationId))) as Record<
        string,
        unknown
      >[],
    },
  ];
  for (const [name, table] of TABLES)
    out.push({
      name,
      rows: (await s.tx.select().from(table).where(s.where(table))) as Record<
        string,
        unknown
      >[],
    });
  return out;
}

/** Stored invoice PDFs and uploaded documents, by their path without the organization folder. */
export async function allDataFiles(
  s: Scoped,
  store: FileStore,
  tables: readonly ExportTable[],
): Promise<{ files: ExportFile[]; missing: string[] }> {
  const paths = [
    ...(tables.find((t) => t.name === "invoices")?.rows ?? []).map(
      (r) => r.pdfPath,
    ),
    ...(tables.find((t) => t.name === "documents")?.rows ?? []).map(
      (r) => r.filePath,
    ),
  ].filter((p): p is string => typeof p === "string" && p !== "");
  const files: ExportFile[] = [];
  const missing: string[] = [];
  const prefix = `${s.organizationId}/`;
  for (const path of [...new Set(paths)]) {
    // Paths always start with the organization's folder (storage policies).
    if (!path.startsWith(prefix)) continue;
    const got = await store.get(path);
    if (got) files.push({ path: path.slice(prefix.length), bytes: got.bytes });
    else missing.push(path);
  }
  return { files, missing };
}

/** Build the export and log who took it. */
export async function exportAllData(
  s: Scoped,
  store: FileStore,
  today: PlainDate,
): Promise<Uint8Array> {
  const tables = await allDataTables(s);
  const { files, missing } = await allDataFiles(s, store, tables);
  await logActivity(s, {
    entityType: "organizations",
    entityId: s.organizationId,
    action: "export",
    after: {
      date: today,
      tables: Object.fromEntries(tables.map((t) => [t.name, t.rows.length])),
      files: files.length,
      missingFiles: missing.length,
    },
  });
  return allDataZip(tables, files);
}
