import { createServerFn } from "@tanstack/react-start";
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
  .inputValidator((data) => ExtractKitInputSchema.parse(data))
  .handler(async ({ data }) => {
    await assertKitOwner(data.kitId, data.ownerToken);
    return extractKitImpl(data);
  });

export const generateSampleCopy = createServerFn({ method: "POST" })
  .inputValidator((data) => GenerateSampleCopyInputSchema.parse(data))
  .handler(async ({ data }) => {
    // Owner-only: brand voice is private data and this call spends AI credits.
    await assertKitOwner(data.kitId, data.ownerToken);
    return generateSampleCopyImpl(data);
  });

export const harvestMoreAssets = createServerFn({ method: "POST" })
  .inputValidator((data) => HarvestMoreAssetsInputSchema.parse(data))
  .handler(async ({ data }) => {
    await assertKitOwner(data.kitId, data.ownerToken);
    return harvestMoreAssetsImpl(data);
  });
