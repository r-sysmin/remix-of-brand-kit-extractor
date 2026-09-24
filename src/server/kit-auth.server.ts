// Ownership gate for browser-owned brand kits. The usable key remains in the
// browser; only its one-way hash is stored with the kit.
import { createHash, timingSafeEqual } from "node:crypto";
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

export async function assertKitOwner(kitId: string, ownerToken: string) {
  const suppliedHash = hashOwnerToken(ownerToken);
  const admin = getAdmin();
  const { data: kit, error } = await admin
    .from("brand_kits")
    .select("*")
    .eq("id", kitId)
    .maybeSingle();
  // Same message whether the kit is missing or owned by somebody else, so the
  // endpoint cannot be used to probe which kit ids exist.
  if (error || !kit) throw new KitAccessError();
  const ownerHash = (kit as { owner_token_hash: string | null }).owner_token_hash;
  if (!ownerHash) {
    // Legacy kit made before browser keys existed: the first browser to open
    // it (by its unguessable id) becomes its owner. Conditional update avoids races.
    const { data: claimed } = await admin
      .from("brand_kits")
      .update({ owner_token_hash: suppliedHash })
      .eq("id", kitId)
      .is("owner_token_hash", null)
      .select("id")
      .maybeSingle();
    if (!claimed) throw new KitAccessError();
    return { ...kit, owner_token_hash: suppliedHash } as Record<string, any>;
  }
  if (!hashesMatch(ownerHash, suppliedHash)) throw new KitAccessError();
  return kit as Record<string, any>;
}
