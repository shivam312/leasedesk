"use server";

// Uploading a document to a lease or a tenant, straight from the browser to
// Storage: prepare (check and sign a path), the browser uploads, then
// finish (check the stored file and record it).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appDb, requireMember, type Member } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { PermissionError, requirePermission } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import {
  DOCUMENT_KINDS,
  DocumentError,
  planUpload,
  recordUpload,
  type DocumentKind,
  type DocumentOwner,
} from "@/lib/files/documents";
import { signedUploadUrl, supabaseStore } from "@/lib/files/supabase";
import { reportError } from "@/lib/monitoring";

const kindSchema = z.enum(
  Object.keys(DOCUMENT_KINDS) as [DocumentKind, ...DocumentKind[]],
  "Choose what the document is.",
);

async function allowed(
  ownerType: DocumentOwner,
  ownerId: string,
): Promise<Member | string> {
  const member = await requireMember();
  try {
    requirePermission(
      member,
      ownerType === "lease" ? "manage_leases" : "manage_tenants",
    );
  } catch (error) {
    if (error instanceof PermissionError) return error.message;
    throw error;
  }
  if (!z.uuid().safeParse(ownerId).success)
    return "Something about this page is out of date. Reload it.";
  return member;
}

/** Step 1: check the file's size and the owner; return where to upload it. */
export async function prepareDocumentUpload(
  ownerType: DocumentOwner,
  ownerId: string,
  size: number,
): Promise<{ url: string; path: string } | { error: string }> {
  const member = await allowed(ownerType, ownerId);
  if (typeof member === "string") return { error: member };
  try {
    const path = await runScoped(appDb, member, (s) =>
      planUpload(s, { ownerType, ownerId, size: Number(size) || 0 }),
    );
    return { url: await signedUploadUrl(path), path };
  } catch (error) {
    if (error instanceof DocumentError) return { error: error.message };
    reportError("Document upload failed", error, { ownerType, ownerId });
    return { error: "The upload didn't work. Try again in a few minutes." };
  }
}

/** Step 3: check what was stored and record it. */
export async function finishDocumentUpload(
  ownerType: DocumentOwner,
  ownerId: string,
  input: { path: string; kind: string; fileName: string },
): Promise<FormState> {
  const member = await allowed(ownerType, ownerId);
  if (typeof member === "string") return { message: member };
  const kind = kindSchema.safeParse(input.kind);
  if (!kind.success)
    return { fieldErrors: { kind: kind.error.issues[0]!.message } };
  try {
    await runScoped(appDb, member, async (s) =>
      recordUpload(s, await supabaseStore(), {
        ownerType,
        ownerId,
        kind: kind.data,
        fileName: String(input.fileName),
        path: String(input.path),
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
  return { tone: "success", message: `Uploaded ${input.fileName}.` };
}
