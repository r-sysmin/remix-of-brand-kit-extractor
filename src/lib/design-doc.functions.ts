import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdmin } from "@/server/supabase-admin.server";
import { assertDesignOwnerHash, hashDesignOwnerToken } from "@/server/design-auth.server";
import {
  parseDesignDoc,
  diffDesignDocs,
  type ParsedDesignDoc,
  type DesignDocDiff,
} from "@/lib/design-doc";

export type DesignVersionListItem = {
  id: string;
  version: number;
  label: string | null;
  created_at: string;
};

export const listDesignVersions = createServerFn({ method: "GET" })
  .inputValidator(z.object({ ownerToken: z.string().min(1).max(200) }).parse)
  .handler(async ({ data }) => {
    const { data: rows, error } = await getAdmin()
      .from("design_doc_versions")
      .select("id, version, label, created_at")
      .eq("owner_token_hash", hashDesignOwnerToken(data.ownerToken))
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return { versions: (rows ?? []) as DesignVersionListItem[] };
  });

export const getDesignVersion = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid(), ownerToken: z.string().min(1).max(200) }).parse)
  .handler(async ({ data }) => {
    const { data: row, error } = await getAdmin()
      .from("design_doc_versions")
      .select("id, version, label, markdown, parsed, created_at, owner_token_hash")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Version not found");
    assertDesignOwnerHash(row.owner_token_hash, data.ownerToken);
    return row as {
      id: string;
      version: number;
      label: string | null;
      markdown: string;
      parsed: ParsedDesignDoc;
      created_at: string;
    };
  });

export const saveDesignVersion = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      ownerToken: z.string().min(1).max(200),
      markdown: z.string().min(1).max(500_000),
      label: z.string().max(200).optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const supabase = getAdmin();
    const parsed = parseDesignDoc(data.markdown);

    // Find next version number.
    const { data: latest } = await supabase
      .from("design_doc_versions")
      .select("version")
      .eq("owner_token_hash", hashDesignOwnerToken(data.ownerToken))
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = ((latest as { version?: number } | null)?.version ?? 0) + 1;

    const insertRow = {
      version: nextVersion,
      label: data.label ?? null,
      markdown: data.markdown,
      parsed: parsed as unknown,
      created_by: null,
      owner_token_hash: hashDesignOwnerToken(data.ownerToken),
    };
    const { data: row, error } = await (supabase
      .from("design_doc_versions") as any)
      .insert(insertRow)
      .select("id, version, label, created_at")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to save snapshot");
    return row as DesignVersionListItem;
  });

export const diffDesignVersions = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      ownerToken: z.string().min(1).max(200),
      aId: z.string().uuid(),
      bId: z.string().uuid(),
    }).parse,
  )
  .handler(async ({ data }): Promise<{
    a: { version: number; label: string | null; created_at: string };
    b: { version: number; label: string | null; created_at: string };
    diff: DesignDocDiff;
  }> => {
    const { data: rows, error } = await getAdmin()
      .from("design_doc_versions")
      .select("id, version, label, parsed, markdown, created_at, owner_token_hash")
      .in("id", [data.aId, data.bId]);
    if (error) throw new Error(error.message);
    if (!rows || rows.length < 2) throw new Error("Both versions are required");
    rows.forEach((row) => assertDesignOwnerHash(row.owner_token_hash, data.ownerToken));
    const a = rows.find((r) => r.id === data.aId);
    const b = rows.find((r) => r.id === data.bId);
    if (!a || !b) throw new Error("Both versions are required");
    const parsedA =
      a.parsed && Object.keys(a.parsed as object).length > 0
        ? (a.parsed as ParsedDesignDoc)
        : parseDesignDoc(a.markdown as string);
    const parsedB =
      b.parsed && Object.keys(b.parsed as object).length > 0
        ? (b.parsed as ParsedDesignDoc)
        : parseDesignDoc(b.markdown as string);
    return {
      a: { version: a.version, label: a.label, created_at: a.created_at },
      b: { version: b.version, label: b.label, created_at: b.created_at },
      diff: diffDesignDocs(parsedA, parsedB),
    };
  });
