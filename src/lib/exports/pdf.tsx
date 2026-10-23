// A report as a PDF (A4 landscape): the title and period, then each section
// as a table whose header repeats on every page, its totals row and the
// notes. Cells read exactly as on screen (cellText). Layout only.

import path from "node:path";
import {
  Document,
  Font,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { PlainDate } from "@/lib/billing/dates";
import { formatDate } from "@/lib/format";
import {
  cellText,
  isNumeric,
  type Column,
  type Report,
  type ReportRow,
} from "@/lib/reports/report";

// Geist has the ₹ sign; react-pdf's built-in Helvetica doesn't (assets/fonts/README.md).
Font.register({
  family: "Geist",
  src: path.join(process.cwd(), "assets/fonts/Geist-Regular.ttf"),
});
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 36,
    fontFamily: "Geist",
    fontSize: 8,
    color: "#111",
  },
  title: { fontSize: 14, marginBottom: 2 },
  muted: { color: "#444" },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 11, marginBottom: 4 },
  th: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#999",
    paddingVertical: 3,
    color: "#444",
    fontSize: 7,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: "#ccc",
    paddingVertical: 3,
  },
  total: { borderBottomWidth: 1, borderColor: "#999" },
  notes: { marginTop: 3, color: "#444", fontSize: 7 },
  firstNote: { marginTop: 10 },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#666",
    fontSize: 7,
  },
});

/** Wider columns for words, then dates, then figures. */
const width = (c: Column) =>
  c.kind === "text" ? 1.6 : c.kind === "date" ? 1.3 : 1.15;

function Cells({ columns, row }: { columns: Column[]; row: ReportRow }) {
  return columns.map((c) => (
    <Text
      key={c.key}
      style={{
        flex: width(c),
        paddingRight: 4,
        textAlign: isNumeric(c.kind) ? "right" : "left",
      }}
    >
      {cellText(c.kind, row[c.key] ?? null)}
    </Text>
  ));
}

function Footer({ report, madeOn }: { report: Report; madeOn: PlainDate }) {
  return (
    <View style={s.footer} fixed>
      <Text>
        {report.title} · {report.period} · Made on {formatDate(madeOn)}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

/** One section per page run, so its repeated header stays with its rows. */
function ReportPdf({ report, madeOn }: { report: Report; madeOn: PlainDate }) {
  return (
    <Document title={`${report.title}, ${report.period}`}>
      {report.sections.map((sec, index) => (
        <Page key={sec.title} size="A4" orientation="landscape" style={s.page}>
          <Text style={s.title}>{report.title}</Text>
          <Text style={s.muted}>{report.period}</Text>
          <View
            style={[s.section, { fontSize: sec.columns.length > 10 ? 7 : 8 }]}
          >
            {report.sections.length > 1 && (
              <Text style={s.sectionTitle}>{sec.title}</Text>
            )}
            {sec.rows.length === 0 ? (
              <Text style={s.muted}>{sec.empty}</Text>
            ) : (
              <>
                <View style={s.th} fixed>
                  {sec.columns.map((c) => (
                    <Text
                      key={c.key}
                      style={{
                        flex: width(c),
                        paddingRight: 4,
                        textAlign: isNumeric(c.kind) ? "right" : "left",
                      }}
                    >
                      {c.label}
                    </Text>
                  ))}
                </View>
                {sec.rows.map((r, i) => (
                  <View key={i} style={s.tr} wrap={false}>
                    <Cells columns={sec.columns} row={r} />
                  </View>
                ))}
                {sec.totals && (
                  <View style={[s.tr, s.total]} wrap={false}>
                    <Cells columns={sec.columns} row={sec.totals} />
                  </View>
                )}
                {sec.columns
                  .filter((c) => c.hint)
                  .map((c, i) => (
                    <Text
                      key={c.key}
                      style={i === 0 ? [s.notes, s.firstNote] : s.notes}
                    >
                      {c.label}: {c.hint}
                    </Text>
                  ))}
              </>
            )}
          </View>
          {index === report.sections.length - 1 &&
            (report.notes ?? []).map((n, i) => (
              <Text key={n} style={i === 0 ? [s.notes, s.firstNote] : s.notes}>
                {n}
              </Text>
            ))}
          <Footer report={report} madeOn={madeOn} />
        </Page>
      ))}
    </Document>
  );
}

export async function renderReportPdf(
  report: Report,
  madeOn: PlainDate,
): Promise<Buffer> {
  return renderToBuffer(<ReportPdf report={report} madeOn={madeOn} />);
}
