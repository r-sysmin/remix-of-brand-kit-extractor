import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ---------- Types shared with the UI ----------

export type BrandProfile = {
  businessName: string;
  offering: string;
  location: string;
  audience: string;
};

export type BrandDirection = {
  name: string;
  concept: string;
  positioning: string;
  targetAudience: string;
  competitorGap: string;
  localCues: string[];
  palette: Array<{ hex: string; name: string; role: string }>;
  headingFont: string;
  bodyFont: string;
  logoDirection: string;
  tone: string[];
  taglines: string[];
  dos: string[];
  donts: string[];
  sampleCopy: string;
};

export type MarketReport = {
  summary: string;
  competitors: Array<{ name: string; url: string; note: string }>;
  sources: Array<{ title: string; url: string }>;
};

const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;

// ---------- 1. Analyze what the kit already knows ----------

export const analyzeKitForBuilder = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ kitId: z.string().uuid(), ownerToken: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { assertKitOwner } = await import("@/server/kit-auth.server");
    const { getAdmin } = await import("@/server/supabase-admin.server");
    const { aiJSON } = await import("@/server/brand-builder.server");
    const kit = await assertKitOwner(data.kitId, data.ownerToken);
    const admin = getAdmin();
    const [colors, fonts, voice] = await Promise.all([
      admin.from("kit_colors").select("hex").eq("kit_id", data.kitId),
      admin.from("kit_fonts").select("family").eq("kit_id", data.kitId),
      admin.from("kit_voice").select("summary,tone").eq("kit_id", data.kitId).maybeSingle(),
    ]);

    let pageText = "";
    if (kit.source_url) {
      try {
        const { firecrawlScrape } = await import("@/server/ai.server");
        const s: any = await firecrawlScrape(kit.source_url);
        const md = s?.markdown ?? s?.data?.markdown ?? "";
        pageText = String(md).slice(0, 8000);
      } catch {
        /* site unreadable — rely on stored kit data */
      }
    }

    const known = {
      name: kit.name,
      sourceUrl: kit.source_url,
      positioning: kit.brand_positioning,
      voiceSummary: voice.data?.summary ?? null,
    };

    const profile = await aiJSON<BrandProfile>({
      instructions:
        "Extract the business profile from the material. Only fill a field if the material states or strongly implies it. " +
        "location must be a real city/region (e.g. 'Austin, Texas') — look for addresses, phone area codes, service-area mentions, " +
        "local landmarks. Use an empty string for anything not supported by the evidence. Never guess.",
      input: `Known kit data:\n${JSON.stringify(known)}\n\nWebsite text:\n${pageText || "(none)"}`,
      schemaName: "brand_profile",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { businessName: str, offering: str, location: str, audience: str },
        required: ["businessName", "offering", "location", "audience"],
      },
    });

    const colorCount = colors.data?.length ?? 0;
    const fontCount = fonts.data?.length ?? 0;
    const hasVoice = !!voice.data?.summary;
    const thin = colorCount < 4 || fontCount < 2 || !hasVoice;
    const missing = (Object.keys(profile) as Array<keyof BrandProfile>).filter(
      (k) => !profile[k]?.trim(),
    );
    const saved = ((kit as any).brand_build ?? null) as
      | { market: MarketReport; directions: BrandDirection[]; profile?: BrandProfile; savedAt?: string }
      | null;
    return {
      profile: saved?.profile ? { ...profile, ...saved.profile } : profile,
      missing: saved?.profile ? [] : missing,
      thin,
      stats: { colorCount, fontCount, hasVoice },
      saved: saved
        ? {
            market: saved.market,
            directions: saved.directions,
            savedAt: saved.savedAt ?? null,
            keywords: ((saved as any).keywords ?? null) as import("@/server/growth-plan.server").KeywordSet | null,
            edge: ((saved as any).edge ?? null) as import("@/server/growth-plan.server").CompetitorEdge | null,
            plan: ((saved as any).plan ?? null) as import("@/server/growth-plan.server").MarketingPlan | null,
            growthDirection: ((saved as any).growthDirection ?? 0) as number,
          }
        : null,
    };
  });

// ---------- 2. Research the local market and build directions ----------

const ProfileSchema = z.object({
  businessName: z.string().max(200),
  offering: z.string().min(2).max(400),
  location: z.string().min(2).max(200),
  audience: z.string().max(400),
});

export const buildBrandDirections = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ kitId: z.string().uuid(), ownerToken: z.string().min(1).max(200), profile: ProfileSchema }).parse(d))
  .handler(async ({ data }) => {
    const { assertKitOwner } = await import("@/server/kit-auth.server");
    const { aiJSON, localSearch } = await import("@/server/brand-builder.server");
    const kit = await assertKitOwner(data.kitId, data.ownerToken);
    const p = data.profile;

    const [rivals, culture, trends] = await Promise.all([
      localSearch(`best ${p.offering} in ${p.location}`, 6),
      localSearch(`${p.location} local culture identity what locals love`, 4),
      localSearch(`${p.offering} market trends ${p.location} ${new Date().getFullYear()}`, 4),
    ]);
    const own = (kit.source_url ?? "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
    const rivalHits = rivals.filter((r) => !own || !r.url.includes(own));
    const all = [...rivalHits, ...culture, ...trends];
    const research = all.length
      ? all.map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.snippet}`).join("\n\n")
      : "(Live research returned nothing — rely on general knowledge of the region and say so in the summary.)";

    const result = await aiJSON<{ market: Omit<MarketReport, "sources">; directions: BrandDirection[] }>({
      effort: "medium",
      instructions:
        "You are a senior brand strategist for local businesses. From a thin brand and live local research, build a " +
        "robust brand file. Be specific to this exact place: reference real local culture, landscape, dialect, history, " +
        "colors of the region, and the competitive set found in research. Every direction must be distinct, bold, " +
        "and commercially sharp — unmistakably ownable, yet precisely right for local buyers. Avoid clichés and generic " +
        "startup aesthetics. Palettes: 5-6 colors with real hex values and roles (primary, secondary, accent, neutral, " +
        "background, text). Fonts must be real Google Fonts families. Keep any existing kit colors/fonts in mind " +
        "and evolve them rather than discarding them when they are sound. Competitors: only name businesses that appear " +
        "in the research. Produce exactly 3 directions.",
      input:
        `Business: ${p.businessName || kit.name}\nOffering: ${p.offering}\nLocation: ${p.location}\n` +
        `Audience: ${p.audience || "(infer from market)"}\nWebsite: ${kit.source_url ?? "(none)"}\n` +
        `Existing positioning: ${JSON.stringify(kit.brand_positioning ?? null)}\n\nLIVE LOCAL RESEARCH:\n${research}`,
      schemaName: "brand_builder",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["market", "directions"],
        properties: {
          market: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "competitors"],
            properties: {
              summary: str,
              competitors: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "url", "note"],
                  properties: { name: str, url: str, note: str },
                },
              },
            },
          },
          directions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "name", "concept", "positioning", "targetAudience", "competitorGap", "localCues",
                "palette", "headingFont", "bodyFont", "logoDirection", "tone", "taglines", "dos", "donts", "sampleCopy",
              ],
              properties: {
                name: str, concept: str, positioning: str, targetAudience: str, competitorGap: str,
                localCues: strArr,
                palette: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["hex", "name", "role"],
                    properties: { hex: str, name: str, role: str },
                  },
                },
                headingFont: str, bodyFont: str, logoDirection: str,
                tone: strArr, taglines: strArr, dos: strArr, donts: strArr, sampleCopy: str,
              },
            },
          },
        },
      },
    });

    const market: MarketReport = {
      ...result.market,
      sources: all.filter((r) => r.url).map((r) => ({ title: r.title || r.url, url: r.url })),
    };
    const directions = result.directions.slice(0, 3);
    const { getAdmin } = await import("@/server/supabase-admin.server");
    const saved = { market, directions, profile: p, savedAt: new Date().toISOString(), keywords: null, edge: null, plan: null };
    await (getAdmin().from("brand_kits") as any).update({ brand_build: saved }).eq("id", data.kitId);
    return { market, directions, savedAt: saved.savedAt };
  });

// ---------- 3. Apply a chosen direction to the kit ----------

const HEX = /^#[0-9a-fA-F]{6}$/;
const DirectionSchema = z.object({
  name: z.string().max(200),
  concept: z.string().max(3000),
  positioning: z.string().max(3000),
  targetAudience: z.string().max(3000),
  competitorGap: z.string().max(3000),
  localCues: z.array(z.string().max(500)).max(20),
  palette: z.array(z.object({ hex: z.string(), name: z.string().max(100), role: z.string().max(300) })).max(12),
  headingFont: z.string().max(100),
  bodyFont: z.string().max(100),
  logoDirection: z.string().max(3000),
  tone: z.array(z.string().max(200)).max(20),
  taglines: z.array(z.string().max(300)).max(20),
  dos: z.array(z.string().max(500)).max(20),
  donts: z.array(z.string().max(500)).max(20),
  sampleCopy: z.string().max(4000),
});

export const applyBrandDirection = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ kitId: z.string().uuid(), ownerToken: z.string().min(1).max(200), direction: DirectionSchema, location: z.string().max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { assertKitOwner } = await import("@/server/kit-auth.server");
    const { getAdmin } = await import("@/server/supabase-admin.server");
    const kit = await assertKitOwner(data.kitId, data.ownerToken);
    const admin = getAdmin();
    const d = data.direction;

    const [{ data: existingColors }, { data: existingFonts }] = await Promise.all([
      admin.from("kit_colors").select("hex,position").eq("kit_id", data.kitId),
      admin.from("kit_fonts").select("family,position").eq("kit_id", data.kitId),
    ]);
    const haveHex = new Set((existingColors ?? []).map((c) => c.hex.toLowerCase()));
    let cPos = Math.max(-1, ...(existingColors ?? []).map((c) => c.position)) + 1;
    const newColors = d.palette
      .filter((c) => HEX.test(c.hex) && !haveHex.has(c.hex.toLowerCase()))
      .map((c) => ({ kit_id: data.kitId, hex: c.hex.toUpperCase(), name: c.name, role: c.role, position: cPos++ }));
    if (newColors.length) await admin.from("kit_colors").insert(newColors);

    const haveFont = new Set((existingFonts ?? []).map((f) => f.family.toLowerCase()));
    let fPos = Math.max(-1, ...(existingFonts ?? []).map((f) => f.position)) + 1;
    const newFonts = [
      { family: d.headingFont, role: "heading" },
      { family: d.bodyFont, role: "body" },
    ]
      .filter((f) => f.family && !haveFont.has(f.family.toLowerCase()))
      .map((f) => ({
        kit_id: data.kitId,
        family: f.family,
        role: f.role,
        google_font: true,
        provider: "google",
        provider_url: `https://fonts.google.com/specimen/${encodeURIComponent(f.family).replace(/%20/g, "+")}`,
        position: fPos++,
      }));
    if (newFonts.length) await admin.from("kit_fonts").insert(newFonts);

    const voiceRow = {
      kit_id: data.kitId,
      summary: `${d.concept}\n\n${d.positioning}`,
      tone: d.tone,
      dos: d.dos,
      donts: d.donts,
      vocabulary: d.localCues,
      samples: { headline: d.taglines[0] ?? "", cta: d.taglines[1] ?? "", slide_title: d.name, email_intro: d.sampleCopy },
      updated_at: new Date().toISOString(),
    };
    const { data: v } = await admin.from("kit_voice").select("id").eq("kit_id", data.kitId).maybeSingle();
    if (v) await admin.from("kit_voice").update(voiceRow).eq("id", v.id);
    else await admin.from("kit_voice").insert(voiceRow);

    const prev = (kit.brand_positioning ?? {}) as Record<string, unknown>;
    await admin
      .from("brand_kits")
      .update({
        brand_positioning: {
          ...prev,
          tagline: d.taglines[0] ?? prev["tagline"] ?? null,
          audience_description: d.targetAudience,
          value_props: (prev["value_props"] as unknown[] | undefined)?.length ? prev["value_props"] : d.dos.slice(0, 4),
          builder: {
            direction: d.name,
            location: data.location,
            competitor_gap: d.competitorGap,
            logo_direction: d.logoDirection,
            local_cues: d.localCues,
            applied_at: new Date().toISOString(),
          },
        } as any,
      })
      .eq("id", data.kitId);

    return { addedColors: newColors.length, addedFonts: newFonts.length };
  });

// ---------- 4. Growth stages: keywords -> competitor edge -> marketing plan ----------

export type { GrowthKeyword, KeywordSet, CompetitorEdge, MarketingPlan } from "@/server/growth-plan.server";

export const buildGrowthStage = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        kitId: z.string().uuid(),
        ownerToken: z.string().min(1).max(200),
        stage: z.enum(["keywords", "edge", "plan"]),
        directionIndex: z.number().int().min(0).max(2).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { assertKitOwner } = await import("@/server/kit-auth.server");
    const { getAdmin } = await import("@/server/supabase-admin.server");
    const g = await import("@/server/growth-plan.server");
    const kit = await assertKitOwner(data.kitId, data.ownerToken);
    const saved = ((kit as any).brand_build ?? null) as any;
    if (!saved?.directions?.length || !saved.profile) throw new Error("Build out the brand first.");
    const direction = saved.directions[data.directionIndex] ?? saved.directions[0];
    const ctx = { profile: saved.profile, market: saved.market, direction, siteUrl: kit.source_url ?? null };

    let patch: Record<string, unknown>;
    if (data.stage === "keywords") patch = { keywords: await g.buildKeywordSet(ctx) };
    else if (data.stage === "edge") patch = { edge: await g.buildCompetitorEdgeFor(ctx, saved.keywords ?? null) };
    else patch = { plan: await g.buildMarketingPlanFor(ctx, saved.keywords ?? null, saved.edge ?? null) };

    // Re-read so parallel writes don't clobber each other.
    const admin = getAdmin();
    const { data: fresh } = await (admin.from("brand_kits") as any).select("brand_build").eq("id", data.kitId).maybeSingle();
    const next = { ...(fresh?.brand_build ?? saved), ...patch, growthDirection: data.directionIndex, savedAt: new Date().toISOString() };
    await (admin.from("brand_kits") as any).update({ brand_build: next }).eq("id", data.kitId);
    return patch as { keywords?: import("@/server/growth-plan.server").KeywordSet; edge?: import("@/server/growth-plan.server").CompetitorEdge; plan?: import("@/server/growth-plan.server").MarketingPlan };
  });
