"use server";

// Uploading a document to a lease or a tenant.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appDb, requireMember } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { PermissionError, requirePermission } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import {
  attachDocument,
  DOCUMENT_KINDS,
  DocumentError,
  type DocumentKind,
  type DocumentOwner,
} from "@/lib/files/documents";
import { supabaseStore } from "@/lib/files/supabase";
import { reportError } from "@/lib/monitoring";

const kindSchema = z.enum(
  Object.keys(DOCUMENT_KINDS) as [DocumentKind, ...DocumentKind[]],
  "Choose what the document is.",
);

export async function uploadDocumentAction(
  ownerType: DocumentOwner,
  ownerId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const member = await requireMember();
  try {
    requirePermission(
      member,
      ownerType === "lease" ? "manage_leases" : "manage_tenants",
    );
  } catch (error) {
    if (error instanceof PermissionError) return { message: error.message };
    throw error;
  }
  if (!z.uuid().safeParse(ownerId).success)
    return { message: "Something about this page is out of date. Reload it." };
  const kind = kindSchema.safeParse(form.get("kind"));
  if (!kind.success)
    return { fieldErrors: { kind: kind.error.issues[0]!.message } };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { fieldErrors: { file: "Choose the file to upload." } };
  try {
    await runScoped(appDb, member, async (s) =>
      attachDocument(s, await supabaseStore(), {
        ownerType,
        ownerId,
        kind: kind.data,
        fileName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      }),
    );
  } catch (error) {
    if (error instanceof DocumentError)
      return { fieldErrors: { file: error.message } };
    reportError("Document upload failed", error, { ownerType, ownerId });
    return { message: "The upload didn't work. Try again in a few minutes." };
  }
  revalidatePath(
    ownerType === "lease" ? `/leases/${ownerId}` : `/tenants/${ownerId}`,
  );
  return { tone: "success", message: `Uploaded ${file.name}.` };
}
