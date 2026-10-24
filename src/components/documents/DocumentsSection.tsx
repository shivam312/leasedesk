import { Card } from "@/components/ui/field";
import type { documents } from "@/lib/db/schema";
import { DOCUMENT_KINDS, type DocumentOwner } from "@/lib/files/documents";
import { MAX_UPLOAD_BYTES } from "@/lib/files/store";
import { formatDate } from "@/lib/format";
import { todayInIndia } from "@/lib/today";
import { uploadDocumentAction } from "@/server/actions/documents";
import { UploadDocumentForm } from "./UploadDocumentForm";

/** A lease's or tenant's documents, each opening in a new tab, and an upload form for those who can. */
export function DocumentsSection({
  ownerType,
  ownerId,
  list,
  canUpload,
  empty,
}: {
  ownerType: DocumentOwner;
  ownerId: string;
  list: (typeof documents.$inferSelect)[];
  canUpload: boolean;
  empty: string;
}) {
  return (
    <section aria-labelledby={`documents-${ownerId}`} className="max-w-2xl">
      <h2 id={`documents-${ownerId}`} className="mb-2 text-lg font-semibold">
        Documents ({list.length})
      </h2>
      {list.length === 0 ? (
        <Card className="mb-4">
          <p className="text-sm">{empty}</p>
        </Card>
      ) : (
        <ul className="mb-4 flex flex-col divide-y rounded-lg border">
          {list.map((d) => (
            <li key={d.id}>
              <a
                href={`/documents/${d.id}`}
                target="_blank"
                rel="noopener"
                className="flex flex-col gap-1 px-4 py-3 hover:bg-accent"
              >
                <span className="font-medium break-words">
                  {d.fileName} (opens in a new tab)
                </span>
                <span className="text-sm text-muted-foreground">
                  {DOCUMENT_KINDS[d.kind as keyof typeof DOCUMENT_KINDS] ??
                    "Document"}{" "}
                  · uploaded {formatDate(todayInIndia(d.createdAt))}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium md:min-h-0">
            Upload a document
          </summary>
          <div className="pt-3">
            <UploadDocumentForm
              kinds={Object.entries(DOCUMENT_KINDS)}
              defaultKind={ownerType === "lease" ? "agreement" : "id_proof"}
              maxMb={Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}
              action={uploadDocumentAction.bind(null, ownerType, ownerId)}
            />
          </div>
        </details>
      )}
    </section>
  );
}
