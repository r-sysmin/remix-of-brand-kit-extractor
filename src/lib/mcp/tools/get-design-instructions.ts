import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { loadKitBundle } from "../kit-data";

export default defineTool({
  name: "get_design_instructions",
  title: "Get design instructions",
  description:
    "Get a full markdown design spec for a brand kit — palette, typography, tokens, voice and usage rules — ready to follow when building on-brand work.",
  inputSchema: { kitId: z.string().uuid().describe("The brand kit's ID.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ kitId }) => {
    let markdown: string;
    try {
      const bundle = await loadKitBundle(kitId);
      const { buildDesignInstructionsMarkdown } = await import("@/lib/exports");
      markdown = buildDesignInstructionsMarkdown({
        name: String(bundle.kit.name ?? "Untitled brand kit"),
        colors: bundle.colors as any,
        fonts: bundle.fonts as any,
        tokens: bundle.tokens as any,
        voice: (bundle.voice ?? {}) as any,
      });
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
    return { content: [{ type: "text", text: markdown }] };
  },
});
