// Server-only Semrush helpers. All calls go through the Lovable connector gateway.
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/semrush";
const TIMEOUT_MS = 20000;

export class SemrushError extends Error {}

function creds() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["SEMRUSH_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new SemrushError(
      "Semrush is not connected yet. Link the Semrush connection to this project and try again.",
    );
  }
  return { lovableKey, connectionKey };
}

type Row = Record<string, string>;

function normalizeRows(json: any): Row[] {
  const data = json?.data ?? json;
  const cols: string[] = data?.columnNames ?? [];
  const rows: any[] = data?.rows ?? [];
  return rows.map((r) => {
    if (Array.isArray(r)) {
      const out: Row = {};
      cols.forEach((c, i) => (out[c] = String(r[i] ?? "")));
      return out;
    }
    const out: Row = {};
    for (const [k, v] of Object.entries(r ?? {})) out[k] = v == null ? "" : String(v);
    return out;
  });
}

async function call(
  group: string,
  method: string,
  params: Record<string, string | number | undefined>,
): Promise<Row[]> {
  const { lovableKey, connectionKey } = creds();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${GATEWAY}/${group}/${method}?${qs.toString()}`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectionKey,
        "Allow-Limit-Offset": "true",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    throw new SemrushError(
      (err as Error)?.name === "AbortError"
        ? "Semrush took too long to respond. Try again."
        : `Could not reach Semrush: ${(err as Error)?.message ?? "network error"}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body handled below */
  }

  const inlineError: string | undefined = json?.error;
  if (!res.ok || inlineError) {
    const message = inlineError ?? text.slice(0, 300);
    console.error(`[semrush] ${group}/${method} failed [${res.status}]: ${message}`);
    if (/LIMIT EXCEEDED/i.test(message)) {
      throw new SemrushError(
        "The Semrush API quota for the connected account is used up. Upgrade the Semrush plan or wait for the quota to reset.",
      );
    }
    if (/NOTHING FOUND/i.test(message)) return [];
    if (res.status === 401 || res.status === 403) {
      throw new SemrushError(`Semrush rejected the request: ${message}`);
    }
    throw new SemrushError(`Semrush request failed [${res.status}]: ${message}`);
  }

  return normalizeRows(json);
}

const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const DomainSchema = z
  .string()
  .trim()
  .min(3)
  .max(253)
  .transform((v) =>
    v
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]!
      .toLowerCase(),
  )
  .refine((v) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v), "Enter a valid domain, like example.com");

export const CompetitorCompareInputSchema = z.object({
  domains: z.array(DomainSchema).min(1).max(4),
  database: z.string().trim().min(2).max(6).default("us"),
  keywordLimit: z.number().int().min(10).max(100).default(50),
});

export const KeywordResearchInputSchema = z.object({
  keyword: z.string().trim().min(2).max(120),
  database: z.string().trim().min(2).max(6).default("us"),
});

export const KeywordDashboardInputSchema = z.object({
  keywords: z.array(z.string().trim().min(2).max(120)).min(1).max(10),
  database: z.string().trim().min(2).max(6).default("us"),
});

// Semrush intent codes.
const INTENT_LABELS: Record<string, string> = {
  "0": "Commercial",
  "1": "Informational",
  "2": "Navigational",
  "3": "Transactional",
};

function parseIntents(raw: string | undefined) {
  return String(raw ?? "")
    .split(",")
    .map((v) => INTENT_LABELS[v.trim()])
    .filter((v): v is string => !!v);
}

// "Td" is a comma-separated list of 12 relative monthly values (0-1),
// oldest first. Returns [] when the column is absent.
function parseTrend(raw: string | undefined) {
  const parts = String(raw ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v));
  return parts.length >= 2 ? parts : [];
}

function trendDirection(trend: number[]) {
  if (trend.length < 4) return { direction: "unknown" as const, change: 0 };
  const half = Math.floor(trend.length / 2);
  const older = trend.slice(0, half);
  const recent = trend.slice(half);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const a = avg(older);
  const b = avg(recent);
  if (a === 0) return { direction: b > 0 ? ("rising" as const) : ("flat" as const), change: 0 };
  const change = ((b - a) / a) * 100;
  const direction =
    change > 10 ? ("rising" as const) : change < -10 ? ("falling" as const) : ("flat" as const);
  return { direction, change };
}

export type KeywordMetrics = {
  phrase: string;
  volume: number;
  cpc: number;
  competition: number;
  difficulty: number;
  results: number;
  intents: string[];
  trend: number[];
  trendDirection: "rising" | "falling" | "flat" | "unknown";
  trendChange: number;
  found: boolean;
};

function toMetrics(r: Row, fallbackPhrase = ""): KeywordMetrics {
  const trend = parseTrend(r["Trends"] ?? r["Td"]);
  const { direction, change } = trendDirection(trend);
  return {
    phrase: r["Keyword"] ?? r["Ph"] ?? fallbackPhrase,
    volume: num(r["Search Volume"] ?? r["Nq"]),
    cpc: num(r["CPC"] ?? r["Cp"]),
    competition: num(r["Competition"] ?? r["Co"]),
    difficulty: num(r["Keyword Difficulty Index"] ?? r["Keyword Difficulty"] ?? r["Kd"]),
    results: num(r["Number of Results"] ?? r["Nr"]),
    intents: parseIntents(r["Intent"] ?? r["In"]),
    trend,
    trendDirection: direction,
    trendChange: change,
    found: true,
  };
}

const KEYWORD_COLUMNS = "Ph,Nq,Cp,Co,Kd,Nr,In,Td";

export async function keywordDashboardImpl(input: z.infer<typeof KeywordDashboardInputSchema>) {
  const keywords = [...new Set(input.keywords.map((k) => k.toLowerCase()))];
  const rows = await call("keywords", "phrase_these", {
    phrase: keywords.join(";"),
    database: input.database,
    export_columns: KEYWORD_COLUMNS,
  });

  const byPhrase = new Map(rows.map((r) => [(r["Keyword"] ?? r["Ph"] ?? "").toLowerCase(), r]));
  const metrics: KeywordMetrics[] = keywords.map((k) => {
    const row = byPhrase.get(k);
    if (row) return toMetrics(row, k);
    return {
      phrase: k,
      volume: 0,
      cpc: 0,
      competition: 0,
      difficulty: 0,
      results: 0,
      intents: [],
      trend: [],
      trendDirection: "unknown",
      trendChange: 0,
      found: false,
    };
  });

  const found = metrics.filter((m) => m.found);
  return {
    database: input.database,
    metrics,
    totals: {
      keywords: metrics.length,
      withData: found.length,
      totalVolume: found.reduce((a, m) => a + m.volume, 0),
      avgDifficulty: found.length
        ? found.reduce((a, m) => a + m.difficulty, 0) / found.length
        : 0,
      avgCpc: found.length ? found.reduce((a, m) => a + m.cpc, 0) / found.length : 0,
      rising: found.filter((m) => m.trendDirection === "rising").length,
    },
  };
}


export type DomainSnapshot = {
  domain: string;
  organicKeywords: number;
  organicTraffic: number;
  organicCost: number;
  paidKeywords: number;
  paidTraffic: number;
  keywords: Array<{
    phrase: string;
    position: number;
    volume: number;
    cpc: number;
    traffic: number;
    url: string;
  }>;
  error?: string;
};

async function snapshot(
  domain: string,
  database: string,
  keywordLimit: number,
): Promise<DomainSnapshot> {
  const base: DomainSnapshot = {
    domain,
    organicKeywords: 0,
    organicTraffic: 0,
    organicCost: 0,
    paidKeywords: 0,
    paidTraffic: 0,
    keywords: [],
  };
  try {
    const [ranks, organic] = await Promise.all([
      call("domains", "domain_ranks", {
        domain,
        database,
        export_columns: "Dn,Rk,Or,Ot,Oc,Ad,At,Ac",
      }),
      call("domains", "domain_organic", {
        domain,
        database,
        export_columns: "Ph,Po,Nq,Cp,Tr,Ur",
        display_limit: keywordLimit,
        display_sort: "tr_desc",
      }),
    ]);
    const r = ranks[0] ?? {};
    return {
      ...base,
      organicKeywords: num(r["Organic Keywords"] ?? r["Or"]),
      organicTraffic: num(r["Organic Traffic"] ?? r["Ot"]),
      organicCost: num(r["Organic Cost"] ?? r["Oc"]),
      paidKeywords: num(r["Adwords Keywords"] ?? r["Ad"]),
      paidTraffic: num(r["Adwords Traffic"] ?? r["At"]),
      keywords: organic.map((k) => ({
        phrase: k["Keyword"] ?? k["Ph"] ?? "",
        position: num(k["Position"] ?? k["Po"]),
        volume: num(k["Search Volume"] ?? k["Nq"]),
        cpc: num(k["CPC"] ?? k["Cp"]),
        traffic: num(k["Traffic (%)"] ?? k["Traffic"] ?? k["Tr"]),
        url: k["Url"] ?? k["URL"] ?? "",
      })),
    };
  } catch (e) {
    if (e instanceof SemrushError) return { ...base, error: e.message };
    throw e;
  }
}

export async function compareCompetitorsImpl(
  input: z.infer<typeof CompetitorCompareInputSchema>,
) {
  const domains = [...new Set(input.domains)];
  const snapshots: DomainSnapshot[] = [];
  for (const d of domains) {
    snapshots.push(await snapshot(d, input.database, input.keywordLimit));
  }

  // Cross analysis: which of the sampled keywords each domain ranks for.
  const byPhrase = new Map<
    string,
    { phrase: string; volume: number; cpc: number; positions: Record<string, number> }
  >();
  for (const s of snapshots) {
    for (const k of s.keywords) {
      if (!k.phrase) continue;
      const entry = byPhrase.get(k.phrase) ?? {
        phrase: k.phrase,
        volume: k.volume,
        cpc: k.cpc,
        positions: {},
      };
      entry.volume = Math.max(entry.volume, k.volume);
      entry.cpc = Math.max(entry.cpc, k.cpc);
      entry.positions[s.domain] = k.position;
      byPhrase.set(k.phrase, entry);
    }
  }

  const matrix = [...byPhrase.values()].sort((a, b) => {
    const shared = Object.keys(b.positions).length - Object.keys(a.positions).length;
    return shared !== 0 ? shared : b.volume - a.volume;
  });

  const primary = snapshots[0]?.domain;
  const overlaps = snapshots.slice(1).map((s) => {
    const mine = new Set(snapshots[0]?.keywords.map((k) => k.phrase) ?? []);
    const theirs = s.keywords.map((k) => k.phrase);
    const shared = theirs.filter((p) => mine.has(p));
    return {
      domain: s.domain,
      sharedCount: shared.length,
      sampleSize: theirs.length,
      gaps: s.keywords
        .filter((k) => k.phrase && !mine.has(k.phrase))
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 25),
    };
  });

  return {
    database: input.database,
    primary,
    snapshots,
    matrix: matrix.slice(0, 60),
    overlaps,
  };
}

export async function keywordResearchImpl(input: z.infer<typeof KeywordResearchInputSchema>) {
  const { keyword, database } = input;
  const [overviewRows, related, questions] = await Promise.all([
    call("keywords", "phrase_this", {
      phrase: keyword,
      database,
      export_columns: KEYWORD_COLUMNS,
    }),
    call("keywords", "phrase_related", {
      phrase: keyword,
      database,
      export_columns: "Ph,Nq,Cp,Kd,In,Td",
      display_limit: 20,
      display_sort: "nq_desc",
    }),
    call("keywords", "phrase_questions", {
      phrase: keyword,
      database,
      export_columns: "Ph,Nq,Cp,Kd,In,Td",
      display_limit: 20,
      display_sort: "nq_desc",
    }),
  ]);

  const o = overviewRows[0] ?? {};
  const mapList = (rows: Row[]) =>
    rows.map((r) => {
      const m = toMetrics(r);
      return {
        phrase: m.phrase,
        volume: m.volume,
        cpc: m.cpc,
        difficulty: m.difficulty,
        intents: m.intents,
        trend: m.trend,
        trendDirection: m.trendDirection,
        trendChange: m.trendChange,
      };
    });

  const overview = toMetrics(o, keyword);
  return {
    database,
    keyword,
    overview: { ...overview, found: overviewRows.length > 0 },
    related: mapList(related),
    questions: mapList(questions),
  };
}

