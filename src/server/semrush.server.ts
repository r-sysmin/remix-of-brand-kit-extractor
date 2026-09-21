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
      export_columns: "Ph,Nq,Cp,Co,Kd,Nr",
    }),
    call("keywords", "phrase_related", {
      phrase: keyword,
      database,
      export_columns: "Ph,Nq,Cp,Kd",
      display_limit: 20,
      display_sort: "nq_desc",
    }),
    call("keywords", "phrase_questions", {
      phrase: keyword,
      database,
      export_columns: "Ph,Nq,Cp,Kd",
      display_limit: 20,
      display_sort: "nq_desc",
    }),
  ]);

  const o = overviewRows[0] ?? {};
  const mapList = (rows: Row[]) =>
    rows.map((r) => ({
      phrase: r["Keyword"] ?? r["Ph"] ?? "",
      volume: num(r["Search Volume"] ?? r["Nq"]),
      cpc: num(r["CPC"] ?? r["Cp"]),
      difficulty: num(r["Keyword Difficulty Index"] ?? r["Keyword Difficulty"] ?? r["Kd"]),
    }));

  return {
    database,
    keyword,
    overview: {
      volume: num(o["Search Volume"] ?? o["Nq"]),
      cpc: num(o["CPC"] ?? o["Cp"]),
      competition: num(o["Competition"] ?? o["Co"]),
      difficulty: num(o["Keyword Difficulty Index"] ?? o["Keyword Difficulty"] ?? o["Kd"]),
      results: num(o["Number of Results"] ?? o["Nr"]),
      found: overviewRows.length > 0,
    },
    related: mapList(related),
    questions: mapList(questions),
  };
}
