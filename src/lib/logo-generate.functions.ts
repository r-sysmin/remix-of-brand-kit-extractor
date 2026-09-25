import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const STYLE_LABELS = {
  combination:
    "a combination mark (a distinct symbol/icon paired with the wordmark text of the brand name)",
  mark: "a symbol or icon mark only — no text, no wordmark, no letters",
  wordmark:
    "a wordmark — stylized lettering of the brand name only, no symbol or icon",
} as const;

export type LogoStyle = keyof typeof STYLE_LABELS;

export const generateLogo = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        kitId: z.string().uuid(),
        ownerToken: z.string().min(1).max(200),
        style: z.enum(["combination", "mark", "wordmark"]).default("combination"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { assertKitOwner } = await import("@/server/kit-auth.server");
    const { getAdmin } = await import("@/server/supabase-admin.server");
    const kit = await assertKitOwner(data.kitId, data.ownerToken);
    const admin = getAdmin();

    // Gather brand context to guide the logo generation.
    const [colorsRes, fontsRes, voiceRes] = await Promise.all([
      admin.from("kit_colors").select("hex,role").eq("kit_id", data.kitId).order("position"),
      admin.from("kit_fonts").select("family,role").eq("kit_id", data.kitId).order("position"),
      admin.from("kit_voice").select("summary,tone").eq("kit_id", data.kitId).maybeSingle(),
    ]);

    const brandBuild = (kit as any).brand_build ?? null;
    const dirIdx = brandBuild?.growthDirection ?? 0;
    const direction =
      brandBuild?.directions?.[dirIdx] ?? brandBuild?.directions?.[0] ?? null;
    const profile = brandBuild?.profile;

    const palette = (colorsRes.data ?? [])
      .slice(0, 6)
      .map((c: any) => `${c.hex}${c.role ? ` (${c.role})` : ""}`)
      .join(", ");
    const headingFont = (fontsRes.data ?? []).find((f: any) =>
      /heading|display/i.test(f.role ?? ""),
    )?.family;
    const bodyFont = (fontsRes.data ?? []).find((f: any) =>
      /body|text/i.test(f.role ?? ""),
    )?.family;
    const tone = voiceRes.data?.tone ?? [];

    const prompt = [
      `Design a professional, original logo for this brand.`,
      `The logo should be ${STYLE_LABELS[data.style]}.`,
      ``,
      `Brand name: "${kit.name}"`,
      profile?.offering ? `What they do: ${profile.offering}` : "",
      profile?.location ? `Location: ${profile.location}` : "",
      direction?.logoDirection
        ? `Logo direction from brand strategy: ${direction.logoDirection}`
        : "",
      direction?.concept ? `Brand concept: ${direction.concept}` : "",
      direction?.localCues?.length
        ? `Local cultural cues: ${direction.localCues.join(", ")}`
        : "",
      palette ? `Brand colors: ${palette}` : "",
      headingFont ? `Heading font style: ${headingFont}` : "",
      bodyFont ? `Body font style: ${bodyFont}` : "",
      tone.length ? `Brand tone: ${tone.join(", ")}` : "",
      ``,
      `STRICT REQUIREMENTS:`,
      `1. The logo MUST feature the exact brand name "${kit.name}" if it includes any text.`,
      `2. Use the brand colors listed above.`,
      `3. Output on a solid white background.`,
      `4. Flat, clean vector style — no shadows, no 3D, no gradients, no glow effects.`,
      `5. Simple enough to be legible at 32px (favicon size) and at 1024px.`,
      `6. Centered with clear margins on all sides.`,
      `7. Do not include any URL, watermark, or extra text beyond the brand name.`,
      `8. Make it distinctive and memorable — not generic.`,
    ]
      .filter(Boolean)
      .join("\n");

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured for this app.");

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        modalities: ["image", "text"],
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("AI rate limit reached. Retry in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    const dataUrl: string | undefined =
      json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith("data:"))
      throw new Error("The AI didn't return an image. Try again.");
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid image payload from AI");
    const buf = new Uint8Array(Buffer.from(match[2], "base64"));
    const contentType = match[1];

    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const path = `${data.kitId}/assets/logo-generated-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("brand-assets")
      .upload(path, buf, { contentType, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const supabaseUrl = process.env.SUPABASE_URL!;
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/brand-assets/${path}`;

    const { data: existing } = await admin
      .from("kit_assets")
      .select("position")
      .eq("kit_id", data.kitId)
      .order("position", { ascending: false })
      .limit(1);
    const pos = (existing?.[0]?.position ?? 0) + 1;

    const { error: insErr } = await admin.from("kit_assets").insert({
      kit_id: data.kitId,
      kind: "logo",
      url: publicUrl,
      storage_path: path,
      position: pos,
    });
    if (insErr) throw new Error(insErr.message);

    return { ok: true, url: publicUrl };
  });
