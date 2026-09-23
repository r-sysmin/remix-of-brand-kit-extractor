import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdmin } from "@/server/supabase-admin.server";
import { assertKitOwner } from "@/server/kit-auth.server";

// Toggle public sharing for a kit. Owner-only, where "owner" comes from the
// verified session — never from request input.
export const setKitShare = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      kitId: z.string().uuid(),
      ownerToken: z.string().min(1).max(200).optional(),
      isPublic: z.boolean(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const admin = getAdmin();
    const k = await assertKitOwner(data.kitId, data.ownerToken);

    const update: Record<string, any> = { is_public: data.isPublic };
    if (data.isPublic && !k.share_token) {
      update.share_token = crypto.randomUUID().replace(/-/g, "");
    }
    const { data: updated, error } = await admin
      .from("brand_kits")
      .update(update)
      .eq("id", data.kitId)
      .select("share_token, is_public")
      .single();
    if (error) throw new Error(error.message);
    return updated as { share_token: string | null; is_public: boolean };
  });

// NOTE: a `claimKit` server function used to live here. It reassigned a kit's
// owner to any client-supplied user id, gated only on knowing the row's
// anon_token — a spoofable, self-attested identity claim. It was unused by the
// UI and has been removed. If kit claiming is reintroduced, derive the user id
// from a verified session (requireSupabaseAuth), never from request input.
