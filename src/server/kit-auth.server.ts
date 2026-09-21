// Ownership gate for brand kits. Every kit server function runs through here
// with the user id taken from a verified Supabase session (never from request
// input), so a caller can only touch kits their own account owns.
import { getAdmin } from "@/server/supabase-admin.server";

export class KitAccessError extends Error {
  constructor(message = "Kit not found") {
    super(message);
    this.name = "KitAccessError";
  }
}

export async function assertKitOwner(kitId: string, userId: string) {
  if (!userId) throw new KitAccessError();
  const admin = getAdmin();
  const { data: kit, error } = await admin
    .from("brand_kits")
    .select("*")
    .eq("id", kitId)
    .maybeSingle();
  // Same message whether the kit is missing or owned by somebody else, so the
  // endpoint cannot be used to probe which kit ids exist.
  if (error || !kit) throw new KitAccessError();
  const owner = (kit as { user_id: string | null }).user_id;
  if (!owner || owner !== userId) throw new KitAccessError();
  return kit as Record<string, any>;
}
