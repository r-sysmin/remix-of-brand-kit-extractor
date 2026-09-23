import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdmin } from "@/server/supabase-admin.server";
import { assertKitOwner } from "@/server/kit-auth.server";

// Toggle public sharing only after the private browser ownership key matches.
export const setKitShare = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      kitId: z.string().uuid(),
      ownerToken: z.string().min(1).max(200),
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

