// Server-only: keyword set, competitor edge and SEO/AEO/GEO marketing plan
// built on top of a finished brand build-out.
import { aiJSON } from "@/server/brand-builder.server";
import { clusterKeywords } from "@/lib/keyword-clusters";
import { SemrushError, compareCompetitorsImpl, keywordDashboardImpl } from "@/server/semrush.server";

const str = { type: "string" } as const;
const num = { type: "number" } as const;
const strArr = { type: "array", items: str } as const;

export type GrowthKeyword = {
  phrase: string;
  volume: number;
  difficulty: number;
  intent: string;
  trend: "rising" | "falling" | "flat" | "unknown";
  group: string;
  priority: "quick win" | "core" | "long-term";
  local: boolean;
  estimated: boolean;
};
export type KeywordSet = { database: string; estimated: boolean; note: string; keywords: GrowthKeyword[] };

export type CompetitorEdge = {
  estimated: boolean;
  note: string;
  rivals: Array<{ name: string; domain: string; sharedKeywords: number | null; gapKeywords: string[] }>;
  advantages: string[];
  threats: string[];
  winningMoves: string[];
};

export type MarketingPlan = {
  headline: string;
  seo: Array<{ page: string; targetKeyword: string; title: string; metaDescription: string; why: string }>;
  aeo: Array<{ question: string; answer: string }>;
  geo: Array<{ action: string; detail: string }>;
  roadmap: { days30: string[]; days60: string[]; days90: string[] };
  firstActions: string[];
};

type Ctx = {
  profile: { businessName: string; offering: string; location: string; audience: string };
  market: { summary: string; competitors: Array<{ name: string; url: string; note: string }> };
  direction: { name: string; positioning: string; competitorGap: string; targetAudience: string };
  siteUrl: string | null;
};

function brief(c: Ctx) {
  return (
    `Business: ${c.profile.businessName}\nOffering: ${c.profile.offering}\nLocation: ${c.profile.location}\n` +
    `Audience: ${c.profile.audience || c.direction.targetAudience}\nWebsite: ${c.siteUrl ?? "(none)"}\n` +
    `Chosen direction: ${c.direction.name} — ${c.direction.positioning}\nCompetitor gap: ${c.direction.competitorGap}\n` +
    `Market: ${c.market.summary}\nCompetitors: ${c.market.competitors.map((x) => `${x.name} (${x.url}) — ${x.note}`).join("; ")}`
  );
}

export function databaseFor(location: string) {
  const l = location.toLowerCase();
  const map: Array<[RegExp, string]> = [
    [/united kingdom|\buk\b|england|scotland|wales|london/, "uk"],
    [/canada|ontario|toronto|vancouver|quebec|alberta/, "ca"],
    [/australia|sydney|melbourne|brisbane/, "au"],
    [/germany|deutschland|berlin|munich/, "de"],
    [/france|paris/, "fr"],
    [/spain|madrid|barcelona/, "es"],
    [/ireland|dublin/, "ie"],
    [/new zealand|auckland/, "nz"],
  ];
  return map.find(([r]) => r.test(l))?.[1] ?? "us";
}

function domainOf(u: string) {
  return u.replace(/^https?:\/\/(www\.)?/i, "").split(/[/?#]/)[0]!.toLowerCase();
}
const VALID_DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;
const SOCIAL = /(yelp|facebook|instagram|google|tripadvisor|linkedin|youtube|tiktok|x\.com|twitter|reddit|wikipedia|bbb\.org|angi|thumbtack|nextdoor)\./;

// ---------- Keywords ----------

export async function buildKeywordSet(c: Ctx): Promise<KeywordSet> {
  const database = databaseFor(c.profile.location);
  const ideas = await aiJSON<{ keywords: Array<{ phrase: string; intent: string; local: boolean; estVolume: number; estDifficulty: number }> }>({
    instructions:
      "You are an SEO strategist. Propose the 30 keywords this business should own. Mix: local-intent phrases using the " +
      "city/region and neighborhoods (if it serves a local area), service/product phrases, comparison and 'near me' phrases, " +
      "and informational questions buyers ask. Lowercase phrases, 2-7 words, no brand names of competitors. intent is one of " +
      "Commercial, Informational, Navigational, Transactional. estVolume = your best monthly US-style search estimate for the " +
      "location; estDifficulty 0-100.",
    input: brief(c),
    schemaName: "keyword_ideas",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["keywords"],
      properties: {
        keywords: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["phrase", "intent", "local", "estVolume", "estDifficulty"],
            properties: { phrase: str, intent: str, local: { type: "boolean" }, estVolume: num, estDifficulty: num },
          },
        },
      },
    },
  });

  const seen = new Set<string>();
  const cands = ideas.keywords
    .map((k) => ({ ...k, phrase: k.phrase.toLowerCase().trim().slice(0, 120) }))
    .filter((k) => k.phrase.length > 2 && !seen.has(k.phrase) && seen.add(k.phrase))
    .slice(0, 30);

  // Enrich with Semrush in batches of 10; fall back to estimates.
  let note = "";
  const real = new Map<string, { volume: number; difficulty: number; intents: string[]; trend: GrowthKeyword["trend"] }>();
  try {
    for (let i = 0; i < cands.length; i += 10) {
      const r = await keywordDashboardImpl({ keywords: cands.slice(i, i + 10).map((k) => k.phrase), database });
      for (const m of r.metrics)
        if (m.found) real.set(m.phrase, { volume: m.volume, difficulty: m.difficulty, intents: m.intents, trend: m.trendDirection });
    }
  } catch (e) {
    note = e instanceof SemrushError ? `Search data unavailable (${e.message}). Numbers are AI estimates.` : "Search data unavailable. Numbers are AI estimates.";
  }
  if (!note && real.size === 0) note = "Search data had no numbers for these phrases. Numbers are AI estimates.";

  const clusters = new Map(clusterKeywords(cands.map((k) => k.phrase)).map((e) => [e.phrase, e.group]));
  const rows: GrowthKeyword[] = cands.map((k) => {
    const r = real.get(k.phrase);
    const volume = Math.max(0, Math.round(r?.volume ?? k.estVolume));
    const difficulty = Math.min(100, Math.max(0, Math.round(r?.difficulty ?? k.estDifficulty)));
    const priority: GrowthKeyword["priority"] =
      difficulty <= 35 ? "quick win" : difficulty <= 60 ? "core" : "long-term";
    return {
      phrase: k.phrase,
      volume,
      difficulty,
      intent: r?.intents[0] ?? k.intent,
      trend: r?.trend ?? "unknown",
      group: clusters.get(k.phrase) ?? "Other",
      priority,
      local: k.local,
      estimated: !r,
    };
  });
  const score = (k: GrowthKeyword) =>
    Math.log10(k.volume + 10) * (1 - k.difficulty / 130) * (/(commercial|transactional)/i.test(k.intent) ? 1.3 : 1) * (k.local ? 1.2 : 1);
  rows.sort((a, b) => score(b) - score(a));
  const keywords = rows.slice(0, 25);
  return { database, estimated: keywords.some((k) => k.estimated), note, keywords };
}

// ---------- Competitor edge ----------

export async function buildCompetitorEdgeFor(c: Ctx, kw: KeywordSet | null): Promise<CompetitorEdge> {
  const rivals = c.market.competitors
    .map((x) => ({ name: x.name, domain: x.url ? domainOf(x.url) : "" }))
    .filter((x) => x.domain && VALID_DOMAIN.test(x.domain) && !SOCIAL.test(x.domain))
    .slice(0, 3);
  const own = c.siteUrl ? domainOf(c.siteUrl) : "";

  let data = "";
  let note = "";
  const rivalOut: CompetitorEdge["rivals"] = rivals.map((r) => ({ ...r, sharedKeywords: null, gapKeywords: [] }));
  if (own && VALID_DOMAIN.test(own) && rivals.length) {
    try {
      const cmp = await compareCompetitorsImpl({ domains: [own, ...rivals.map((r) => r.domain)], database: kw?.database ?? "us", keywordLimit: 30 });
      for (const o of cmp.overlaps) {
        const r = rivalOut.find((x) => x.domain === o.domain);
        if (r) {
          r.sharedKeywords = o.sharedCount;
          r.gapKeywords = o.gaps.slice(0, 10).map((g) => g.phrase);
        }
      }
      data = JSON.stringify(cmp.snapshots.map((s) => ({ domain: s.domain, keywords: s.organicKeywords, traffic: s.organicTraffic, error: s.error })));
      if (cmp.snapshots.every((s) => s.error)) note = "Search data unavailable — comparison is based on research.";
    } catch (e) {
      note = e instanceof SemrushError ? `Search data unavailable (${e.message}) — comparison is based on research.` : "Search data unavailable — comparison is based on research.";
    }
  } else note = own ? "No rival websites found to compare — comparison is based on research." : "No website on this kit — comparison is based on research.";

  const ai = await aiJSON<{ advantages: string[]; threats: string[]; winningMoves: string[] }>({
    instructions:
      "You are a competitive strategist. Name this business's sharpest competitive advantages versus the local rivals, the real " +
      "threats, and specific winning moves (search, reviews, offers, content, partnerships). Be concrete and local. 4-6 items each.",
    input: `${brief(c)}\n\nSearch comparison: ${data || "(none)"}\nRival gap keywords: ${JSON.stringify(rivalOut)}\nOur keywords: ${kw?.keywords.slice(0, 15).map((k) => k.phrase).join(", ") ?? ""}`,
    schemaName: "competitor_edge",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["advantages", "threats", "winningMoves"],
      properties: { advantages: strArr, threats: strArr, winningMoves: strArr },
    },
  });
  return { estimated: !!note, note, rivals: rivalOut, ...ai };
}

// ---------- Marketing plan ----------

export async function buildMarketingPlanFor(c: Ctx, kw: KeywordSet | null, edge: CompetitorEdge | null): Promise<MarketingPlan> {
  const item = (props: string[]) => ({
    type: "array",
    items: { type: "object", additionalProperties: false, required: props, properties: Object.fromEntries(props.map((p) => [p, str])) },
  });
  return aiJSON<MarketingPlan>({
    effort: "medium",
    instructions:
      "You are a go-to-market lead. Write a launch-to-market plan for this business. seo: 6-8 pages to build or improve, each " +
      "targeting one keyword from the list, with title (<60 chars) and meta description (<155 chars). aeo: 6-8 question/answer " +
      "pairs written so answer engines can quote them (40-60 word answers, include the location when local). geo: 6-8 actions " +
      "for local and AI-search visibility (Google Business Profile, citations, reviews, location pages, structured data, being " +
      "cited by AI assistants). roadmap: 3-5 items per phase. firstActions: exactly 5 things to do this week. Use the chosen " +
      "brand voice and the competitive edge.",
    input: `${brief(c)}\n\nKeywords: ${kw?.keywords.map((k) => `${k.phrase} (${k.volume}/mo, KD ${k.difficulty}, ${k.priority})`).join("; ") ?? "(none)"}\n` +
      `Advantages: ${edge?.advantages.join("; ") ?? ""}\nWinning moves: ${edge?.winningMoves.join("; ") ?? ""}`,
    schemaName: "marketing_plan",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["headline", "seo", "aeo", "geo", "roadmap", "firstActions"],
      properties: {
        headline: str,
        seo: item(["page", "targetKeyword", "title", "metaDescription", "why"]),
        aeo: item(["question", "answer"]),
        geo: item(["action", "detail"]),
        roadmap: {
          type: "object",
          additionalProperties: false,
          required: ["days30", "days60", "days90"],
          properties: { days30: strArr, days60: strArr, days90: strArr },
        },
        firstActions: strArr,
      },
    },
  });
}
