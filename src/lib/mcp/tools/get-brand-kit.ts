import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { loadKitBundle, toKitJson } from "../kit-data";
import { requireUserId } from "../require-user";

export default defineTool({
  name: "get_brand_kit",
  title: "Get brand kit",
  description:
    "Read an existing brand kit by its ID: colors, fonts, design tokens, assets and voice.",
  inputSchema: { kitId: z.string().uuid().describe("The brand kit's ID.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ kitId }, ctx) => {
    const userId = requireUserId(ctx);
    let bundle;
    try {
      bundle = await loadKitBundle(kitId, userId);
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
    const kit = toKitJson(bundle);
    return {
      content: [{ type: "text", text: JSON.stringify(kit, null, 2) }],
      structuredContent: { kit },
    };
  },
});
