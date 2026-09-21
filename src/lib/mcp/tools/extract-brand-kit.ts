import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createKitRow, loadKitBundle, toKitJson } from "../kit-data";

export default defineTool({
  name: "extract_brand_kit",
  title: "Extract brand kit from a website",
  description:
    "Extract a brand kit from a website URL: colors, fonts, design tokens, logo assets and brand voice. Takes up to a minute. Returns the new kit, including its ID for later reads.",
  inputSchema: {
    url: z.string().url().describe("Website URL to extract the brand from."),
    name: z.string().max(120).optional().describe("Optional name for the new brand kit."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  handler: async ({ url, name }, ctx) => {
    let kitId: string;
    try {
      kitId = await createKitRow({ sourceUrl: url, name });
    } catch (e) {
      throw new ToolError((e as Error).message);
    }

    await ctx.progress({ progress: 1, total: 3, message: "Reading the website" });

    const { extractKitImpl } = await import("@/server/extraction.server");
    const result = await extractKitImpl({ kitId, ownerToken: `mcp:${kitId}`, url });
    if (!result.ok) {
      throw new ToolError(
        `Extraction failed: ${"error" in result ? result.error : "unknown error"} (kit id ${kitId})`,
      );
    }

    await ctx.progress({ progress: 2, total: 3, message: "Collecting the results" });

    const kit = toKitJson(await loadKitBundle(kitId));
    const degraded = "degraded" in result && result.degraded;
    return {
      content: [
        {
          type: "text",
          text:
            (degraded
              ? `Note: the site could not be read fully, so parts of this kit are approximate (${(result as any).degradedReason ?? "degraded extraction"}).\n\n`
              : "") + JSON.stringify(kit, null, 2),
        },
      ],
      structuredContent: { kit, degraded: !!degraded },
    };
  },
});
