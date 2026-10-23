// The invoice PDF (A4), laid out from invoiceDocument(). Layout only: what
// is printed, and every amount, comes from document.ts.

import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { InvoiceDocument } from "./document";

// Geist has the ₹ sign; react-pdf's built-in Helvetica doesn't (assets/fonts/README.md).
Font.register({
  family: "Geist",
  src: path.join(process.cwd(), "assets/fonts/Geist-Regular.ttf"),
});
// Long tenant names and addresses wrap at spaces only, never mid-word with a hyphen.
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Geist", fontSize: 10, color: "#111" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  half: { flex: 1 },
  title: { fontSize: 16, marginBottom: 4, textAlign: "right" },
  name: { fontSize: 12, marginBottom: 2 },
  muted: { color: "#444" },
  label: { color: "#444", fontSize: 9, marginBottom: 2 },
  copyLabel: { color: "#444", fontSize: 9, textAlign: "right" },
  section: { marginTop: 14 },
  notice: {
    marginBottom: 10,
    padding: 8,
    borderWidth: 2,
    borderColor: "#b45309",
    color: "#b45309",
    fontSize: 12,
    textAlign: "center",
  },
  toPay: { fontSize: 12, marginTop: 6 },
  table: { marginTop: 14, borderTopWidth: 1, borderColor: "#999" },
  th: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#999",
    paddingVertical: 4,
    color: "#444",
    fontSize: 9,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: "#ccc",
    paddingVertical: 5,
  },
  cNo: { width: 18 },
  cDesc: { flex: 1, paddingRight: 6 },
  cSac: { width: 46 },
  cAmt: { width: 72, textAlign: "right" },
  cTax: { width: 118, textAlign: "right" },
  totals: { marginTop: 10, marginLeft: "auto", width: 220 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: "#999",
    marginTop: 2,
    paddingTop: 4,
    fontSize: 12,
  },
  qr: { width: 96, height: 96 },
  footer: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  sign: {
    width: 180,
    borderTopWidth: 0.5,
    borderColor: "#999",
    paddingTop: 4,
    textAlign: "center",
  },
});

function Field({ label, children }: { label: string; children: string }) {
  return (
    <Text>
      <Text style={s.muted}>{label}: </Text>
      {children}
    </Text>
  );
}

export function InvoicePdf({
  doc,
  qr,
}: {
  doc: InvoiceDocument;
  /** The UPI QR as a PNG data URL, or null. */
  qr: string | null;
}) {
  return (
    <Document
      title={`${doc.title === "Credit Note" ? "Credit note" : "Invoice"} ${doc.number} – ${doc.recipient.name}`}
      author={doc.supplier.name}
    >
      <Page size="A4" style={s.page}>
        {/* Repeated on every page, so no page of a draft or cancelled invoice passes for a payable one. */}
        {doc.notice && (
          <Text style={s.notice} fixed>
            {doc.notice}
          </Text>
        )}
        <View style={s.row}>
          <View style={s.half}>
            <Text style={s.name}>{doc.supplier.name}</Text>
            <Text>{doc.supplier.address}</Text>
            <Field label="GSTIN">{doc.supplier.gstin}</Field>
            {doc.supplier.pan && <Field label="PAN">{doc.supplier.pan}</Field>}
          </View>
          <View style={s.half}>
            <Text style={s.title}>{doc.title}</Text>
            <Text style={s.copyLabel}>{doc.copyLabel}</Text>
            <Text style={{ textAlign: "right" }}>
              <Text style={s.muted}>{doc.numberLabel}: </Text>
              {doc.number}
            </Text>
            <Text style={{ textAlign: "right" }}>
              <Text style={s.muted}>{doc.dateLabel}: </Text>
              {doc.invoiceDate}
            </Text>
            {doc.dueDate && (
              <Text style={{ textAlign: "right" }}>
                <Text style={s.muted}>Due date: </Text>
                {doc.dueDate}
              </Text>
            )}
            {doc.against && (
              <Text style={{ textAlign: "right" }}>
                <Text style={s.muted}>Against invoice: </Text>
                {doc.against}
              </Text>
            )}
          </View>
        </View>

        <View style={[s.row, s.section]}>
          <View style={s.half}>
            <Text style={s.label}>Bill to</Text>
            <Text style={s.name}>{doc.recipient.name}</Text>
            <Text>{doc.recipient.address}</Text>
            <Field label="GSTIN">{doc.recipient.gstin}</Field>
            <Field label="State">{doc.recipient.state}</Field>
          </View>
          <View style={s.half}>
            <Text style={s.label}>Property</Text>
            <Text>{doc.property}</Text>
            <Field label="Place of supply">{doc.placeOfSupply}</Field>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.th} fixed>
            <Text style={s.cNo}>#</Text>
            <Text style={s.cDesc}>Description and period</Text>
            <Text style={s.cSac}>SAC</Text>
            <Text style={s.cAmt}>Taxable value</Text>
            <Text style={s.cTax}>{doc.taxColumns.join(" / ")}</Text>
            <Text style={s.cAmt}>Total</Text>
          </View>
          {doc.lines.map((l) => (
            <View key={l.number} style={s.tr} wrap={false}>
              <Text style={s.cNo}>{l.number}</Text>
              <View style={s.cDesc}>
                <Text>{l.description}</Text>
                {l.detail && <Text style={s.muted}>{l.detail}</Text>}
                <Text style={s.muted}>{l.period}</Text>
              </View>
              <Text style={s.cSac}>{l.sac}</Text>
              <Text style={s.cAmt}>{l.taxable}</Text>
              <View style={s.cTax}>
                {l.taxes.map((t) => (
                  <Text key={t}>{t}</Text>
                ))}
              </View>
              <Text style={s.cAmt}>{l.total}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals} wrap={false}>
          {doc.totals.slice(0, -1).map((t) => (
            <View key={t.label} style={s.totalRow}>
              <Text style={s.muted}>{t.label}</Text>
              <Text>{t.amount}</Text>
            </View>
          ))}
          <View style={s.grand}>
            <Text>{doc.totals.at(-1)!.label}</Text>
            <Text>{doc.totals.at(-1)!.amount}</Text>
          </View>
        </View>
        <Text style={s.section}>{doc.amountInWords}</Text>
        {doc.reason && <Field label="Reason">{doc.reason}</Field>}

        {doc.payment && (
          <View style={[s.row, s.section]} wrap={false}>
            <View style={s.half}>
              <Text style={s.label}>How to pay</Text>
              {doc.payment.rows.map(([k, v]) => (
                <Field key={k} label={k}>
                  {v}
                </Field>
              ))}
              {doc.payment.toPay && (
                <Text style={s.toPay}>Amount to pay: {doc.payment.toPay}</Text>
              )}
              <Text style={[s.muted, { marginTop: 4 }]}>
                Please quote the invoice number in your payment reference.
              </Text>
            </View>
            {qr && (
              <View>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                <Image src={qr} style={s.qr} />
                <Text style={[s.muted, { textAlign: "center" }]}>
                  Scan to pay by UPI
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={s.footer} wrap={false}>
          <View>
            <Text>
              Whether tax is payable on reverse charge: {doc.reverseCharge}
            </Text>
            <Text style={s.muted}>{doc.footnote}</Text>
          </View>
          <View>
            <Text style={{ marginBottom: 28, textAlign: "center" }}>
              For {doc.supplier.name}
            </Text>
            <Text style={s.sign}>Authorised signatory</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** The invoice as PDF bytes, with its UPI QR code. */
export async function renderInvoicePdf(doc: InvoiceDocument): Promise<Buffer> {
  const qr = doc.payment?.upiLink
    ? await QRCode.toDataURL(doc.payment.upiLink, { margin: 1, width: 240 })
    : null;
  return renderToBuffer(<InvoicePdf doc={doc} qr={qr} />);
}
