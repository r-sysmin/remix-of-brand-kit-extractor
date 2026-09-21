// Shared data helpers for the MCP tools. Loads the server-only Supabase client
// lazily so the MCP entry stays import-safe.
export type KitBundle = {
  kit: any;
  colors: any[];
  fonts: any[];
  tokens: any[];
  assets: any[];
  voice: any | null;
};

async function admin() {
  const { getAdmin } = await import("@/server/supabase-admin.server");
  return getAdmin();
}

// Owner-scoped load: the caller must be the signed-in owner of the kit. Both
// "missing" and "not yours" return the same message so kit ids can't be probed.
export async function loadKitBundle(kitId: string, userId: string): Promise<KitBundle> {
  if (!userId) throw new Error("No brand kit found with that ID.");
  const db = await admin();
  const { data: kit } = await db
    .from("brand_kits")
    .select("*")
    .eq("id", kitId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!kit) throw new Error("No brand kit found with that ID.");
  const [colors, fonts, tokens, assets, voice] = await Promise.all([
    db.from("kit_colors").select("*").eq("kit_id", kitId).order("position"),
    db.from("kit_fonts").select("*").eq("kit_id", kitId).order("position"),
    db.from("kit_tokens").select("*").eq("kit_id", kitId).order("position"),
    db.from("kit_assets").select("*").eq("kit_id", kitId).order("position"),
    db.from("kit_voice").select("*").eq("kit_id", kitId).maybeSingle(),
  ]);
  return {
    kit,
    colors: colors.data ?? [],
    fonts: fonts.data ?? [],
    tokens: tokens.data ?? [],
    assets: assets.data ?? [],
    voice: voice.data ?? null,
  };
}

export async function createKitRow(args: { sourceUrl?: string; name?: string; userId: string }) {
  if (!args.userId) throw new Error("Sign-in is required to create a brand kit.");
  const db = await admin();
  const { data, error } = await db
    .from("brand_kits")
    .insert({
      name: args.name ?? "Untitled brand kit",
      source_type: args.sourceUrl ? "url" : "manual",
      source_url: args.sourceUrl ?? null,
      status: "pending",
      user_id: args.userId,
      anon_token: null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the brand kit.");
  return (data as any).id as string;
}

// Compact, JSON-shaped view of a kit for structuredContent.
export function toKitJson(b: KitBundle) {
  return {
    id: String(b.kit.id),
    name: String(b.kit.name ?? "Untitled brand kit"),
    status: String(b.kit.status ?? "unknown"),
    sourceUrl: b.kit.source_url ? String(b.kit.source_url) : null,
    colors: b.colors.map((c: any) => ({
      hex: String(c.hex),
      role: c.role ? String(c.role) : null,
      name: c.name ? String(c.name) : null,
    })),
    fonts: b.fonts.map((f: any) => ({
      family: String(f.family),
      role: f.role ? String(f.role) : null,
      weights: Array.isArray(f.weights) ? f.weights.map((w: any) => String(w)) : [],
      provider: f.provider ? String(f.provider) : null,
      license: f.license ? String(f.license) : null,
      isSubstitute: !!f.is_substitute,
    })),
    tokens: b.tokens.map((t: any) => ({
      name: String(t.name ?? ""),
      value: String(t.value ?? ""),
      category: t.category ? String(t.category) : null,
    })),
    assets: b.assets.map((a: any) => ({
      kind: String(a.kind ?? ""),
      url: String(a.storage_url ?? a.url ?? ""),
    })),
    voice: b.voice
      ? {
          tone: b.voice.tone ? String(b.voice.tone) : null,
          summary: b.voice.summary ? String(b.voice.summary) : null,
        }
      : null,
  };
}
