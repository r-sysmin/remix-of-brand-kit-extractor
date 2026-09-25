// Ownership gate for brand kits. A kit is owned by a signed-in account
// (brand_kits.user_id) and/or a browser-held key (brand_kits.owner_token_hash).
// The usable browser key never leaves the browser; only its one-way hash is stored.
import { createHash, timingSafeEqual } from "node:crypto";
import { getRequestHeader } from "@tanstack/react-start";
import { getAdmin } from "@/server/supabase-admin.server";

export class KitAccessError extends Error {
  constructor(message = "Kit not found") {
    super(message);
    this.name = "KitAccessError";
  }
}

export function hashOwnerToken(ownerToken: string): string {
  if (!ownerToken || ownerToken.length > 200) throw new KitAccessError();
  return createHash("sha256").update(ownerToken, "utf8").digest("hex");
}

function hashesMatch(stored: string | null, supplied: string): boolean {
  if (!stored || stored.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(supplied));
}

// Returns the signed-in user's id when the request carries a valid bearer
// token, else null. Never throws — callers treat null as "signed out".
export async function getSessionUserId(): Promise<string | null> {
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  if (!token) return null;
  try {
    const { data, error } = await getAdmin().auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export async function assertKitOwner(kitId: string, ownerToken: string) {
  const suppliedHash = hashOwnerToken(ownerToken);
  const admin = getAdmin();
  const [{ data: kit, error }, sessionUserId] = await Promise.all([
    admin.from("brand_kits").select("*").eq("id", kitId).maybeSingle(),
    getSessionUserId(),
  ]);
  // Same message whether the kit is missing or owned by somebody else, so the
  // endpoint cannot be used to probe which kit ids exist.
  if (error || !kit) throw new KitAccessError();
  const row = kit as Record<string, any>;
  const ownerHash = row.owner_token_hash as string | null;
  const ownerUserId = row.user_id as string | null;

  // Signed-in owner of record.
  if (sessionUserId && ownerUserId === sessionUserId) return row;

  // Browser key matches.
  if (ownerHash && hashesMatch(ownerHash, suppliedHash)) {
    // Link the kit to the signed-in account so it follows them across devices.
    if (sessionUserId && !ownerUserId) {
      await admin
        .from("brand_kits")
        .update({ user_id: sessionUserId })
        .eq("id", kitId)
        .is("user_id", null);
      row.user_id = sessionUserId;
    }
    return row;
  }

  if (!ownerHash && !ownerUserId) {
    // Legacy kit made before ownership existed: the first browser to open it
    // (by its unguessable id) becomes its owner. Conditional update avoids races.
    const { data: claimed } = await admin
      .from("brand_kits")
      .update({ owner_token_hash: suppliedHash, user_id: sessionUserId ?? null })
      .eq("id", kitId)
      .is("owner_token_hash", null)
      .is("user_id", null)
      .select("id")
      .maybeSingle();
    if (!claimed) throw new KitAccessError();
    return { ...row, owner_token_hash: suppliedHash, user_id: sessionUserId ?? null };
  }

  throw new KitAccessError();
}
