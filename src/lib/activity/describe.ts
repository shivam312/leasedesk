// The activity section on a record's page: each activity_log row as one
// plain sentence ("Tenant changed: company name, GSTIN"). Pure.

const NOUNS: Record<string, string> = {
  tenants: "Tenant",
  tenant_contacts: "Contact",
  leases: "Lease",
  lease_charges: "Charge",
  lease_units: "Unit on the lease",
  escalation_rules: "Rent increase",
  custom_escalations: "Rent increase",
  critical_dates: "Lease date",
  invoices: "Invoice",
  invoice_lines: "Invoice line",
  invoice_email: "Invoice email",
  credit_notes: "Credit note",
  credit_note_email: "Credit note email",
  payments: "Payment",
  payment_allocations: "Payment applied",
  tds_records: "TDS",
  reminders: "Reminder",
  reminder_email: "Reminder email",
  documents: "Document",
};

const VERBS: Record<string, string> = {
  create: "added",
  update: "changed",
  delete: "removed",
  send: "sent",
  reverse: "reversed",
  remove: "removed",
};

// Bookkeeping columns, never worth saying.
const QUIET = new Set([
  "id",
  "organizationId",
  "createdAt",
  "updatedAt",
  "inviteTokenHash",
]);

const FIELD_WORDS: Record<string, string> = {
  gstin: "GSTIN",
  pan: "PAN",
  pdfPath: "stored PDF",
  sentTo: "sent to",
  isPrimary: "main contact",
  tdsRateBpRent: "TDS on rent",
  tdsRateBpCam: "TDS on maintenance",
  deductsTdsRent: "TDS on rent",
  stateCode: "state",
};

/** "companyName" → "company name". */
export function fieldWords(key: string): string {
  return (
    FIELD_WORDS[key] ??
    key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .toLowerCase()
  );
}

/** The fields an update changed, in words. */
export function changedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter((k) => !QUIET.has(k))
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map(fieldWords);
}

export type ActivityEntry = {
  entityType: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

/** One sentence for one log row. */
export function activityLine(e: ActivityEntry): string {
  const noun = NOUNS[e.entityType] ?? fieldWords(e.entityType);
  if (e.entityType.endsWith("_email") && e.action === "send") {
    const a = e.after ?? {};
    const to = Array.isArray(a.to) ? (a.to as string[]).join(", ") : "";
    if (a.kind === "emailed" || a.status === "sent")
      return `${noun.replace(/ email$/, "")} emailed${to ? ` to ${to}` : ""}`;
    if (a.kind === "no_email")
      return `${noun.replace(/ email$/, "")} not emailed: no email address`;
    return `${noun} failed${typeof a.message === "string" ? `: ${a.message}` : ""}`;
  }
  const verb = VERBS[e.action] ?? e.action.replace(/_/g, " ");
  if (e.action === "update") {
    const fields = changedFields(e.before, e.after);
    if (fields.length === 0) return `${noun} saved, nothing changed`;
    const shown = fields.slice(0, 4).join(", ");
    return `${noun} changed: ${shown}${fields.length > 4 ? ` and ${fields.length - 4} more` : ""}`;
  }
  return `${noun} ${verb}`;
}
