import { defineMcp } from "@lovable.dev/mcp-js";
import extractBrandKitTool from "./tools/extract-brand-kit";
import getBrandKitTool from "./tools/get-brand-kit";
import getDesignInstructionsTool from "./tools/get-design-instructions";

export default defineMcp({
  name: "remix-of-brand-kit-extractor",
  title: "Remix of Brand Kit Extractor",
  version: "0.1.0",
  instructions:
    "Tools for Brand Kit Extractor. Use `extract_brand_kit` to pull a brand's colors, fonts, tokens and voice from a website URL (this can take up to a minute). Use `get_brand_kit` to read an existing kit by its ID, and `get_design_instructions` to get a full markdown design spec for a kit that you can follow when building on-brand work.",
  tools: [extractBrandKitTool, getBrandKitTool, getDesignInstructionsTool],
});
