import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertKitOwner } from "@/server/kit-auth.server";
import {
  ExtractKitInputSchema,
  GenerateSampleCopyInputSchema,
  HarvestMoreAssetsInputSchema,
  extractKitImpl,
  generateSampleCopyImpl,
  harvestMoreAssetsImpl,
} from "@/server/extraction.server";

export const extractKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => ExtractKitInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertKitOwner(data.kitId, context.userId);
    return extractKitImpl(data);
  });

export const generateSampleCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => GenerateSampleCopyInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Owner-only: brand voice is private data and this call spends AI credits.
    await assertKitOwner(data.kitId, context.userId);
    return generateSampleCopyImpl(data);
  });

export const harvestMoreAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => HarvestMoreAssetsInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertKitOwner(data.kitId, context.userId);
    return harvestMoreAssetsImpl(data);
  });
