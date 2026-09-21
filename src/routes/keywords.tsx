import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Loader2, Minus, Search } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { keywordDashboard, researchKeyword } from "@/lib/semrush.functions";

export const Route = createFileRoute("/keywords")({
  head: () => ({
    meta: [
      { title: "Keyword dashboard — Brand DNA" },
      {
        name: "description",
        content:
          "Track a set of keywords side by side: monthly search volume, ranking difficulty, searcher intent and 12-month demand trend, plus related phrases and questions.",
      },
      { property: "og:title", content: "Keyword dashboard — Brand DNA" },
      {
        property: "og:description",
        content:
          "Search volume, difficulty, intent and 12-month trend for every keyword you track, side by side.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/keywords" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/keywords" }],
  }),
  component: KeywordsPage,
});

const MARKETS = [
  ["us", "United States"],
  ["uk", "United Kingdom"],
  ["ca", "Canada"],
  ["au", "Australia"],
  ["de", "Germany"],
  ["fr", "France"],
  ["es", "Spain"],
  ["nl", "Netherlands"],
  ["br", "Brazil"],
  ["in", "India"],
] as const;

const label = "font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground";
const field =
  "w-full rounded-md border border-border-subtle bg-card px-3 py-2 font-sans text-sm text-foreground outline-none focus:border-foreground";
const button =
  "inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 font-mono text-[12px] uppercase tracking-[0.12em] text-background transition-opacity hover:opacity-90 disabled:opacity-40";
const card = "rounded-xl border border-border-subtle bg-card p-5";
const th = "px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground";
const td = "px-3 py-2 align-middle font-sans text-[13px]";

const fmt = (n: number) => (n >= 1000 ? n.toLocaleString("en-US") : String(Math.round(n)));
const money = (n: number) => `$${n.toFixed(2)}`;

type Trend = "rising" | "falling" | "flat" | "unknown";

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-border-subtle bg-surface px-3 py-2 font-sans text-[13px] italic text-muted-foreground">
      {children}
    </p>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <span className="font-sans text-[12px] text-muted-foreground">no history</span>;
  }
  const max = Math.max(...values) || 1;
  const w = 72;
  const h = 20;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="overflow-visible"
      role="img"
      aria-label={`Relative monthly demand over the last ${values.length} months`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrendBadge({ direction, change }: { direction: Trend; change: number }) {
  if (direction === "unknown") {
    return <span className="font-sans text-[12px] text-muted-foreground">—</span>;
  }
  const Icon = direction === "rising" ? ArrowUpRight : direction === "falling" ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em]">
      <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      {direction === "flat" ? "steady" : `${change > 0 ? "+" : ""}${Math.round(change)}%`}
    </span>
  );
}

function Intents({ intents }: { intents: string[] }) {
  if (intents.length === 0) {
    return <span className="font-sans text-[12px] text-muted-foreground">unknown</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {intents.map((i) => (
        <span
          key={i}
          className="rounded-full border border-border-subtle px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]"
        >
          {i}
        </span>
      ))}
    </span>
  );
}

function Difficulty({ value }: { value: number }) {
  if (!value) return <span className="font-sans text-[12px] text-muted-foreground">unknown</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1 w-14 overflow-hidden rounded-full bg-surface">
        <span
          className="block h-full bg-foreground"
          style={{ width: `${Math.min(100, Math.max(2, value))}%` }}
        />
      </span>
      <span className="font-mono text-[11px]">{Math.round(value)}</span>
    </span>
  );
}

type SortKey =
  | "phrase"
  | "volume"
  | "difficulty"
  | "intent"
  | "trendChange"
  | "cpc"
  | "group";

type SortDir = "asc" | "desc";

type Filters = {
  minVolume: string;
  maxVolume: string;
  minDifficulty: string;
  maxDifficulty: string;
  intent: string;
  trend: string;
  group: string;
};

const EMPTY_FILTERS: Filters = {
  minVolume: "",
  maxVolume: "",
  minDifficulty: "",
  maxDifficulty: "",
  intent: "any",
  trend: "any",
  group: "any",
};

type Preset = { name: string; filters: Filters; sortKey: SortKey; sortDir: SortDir };

const PRESETS_KEY = "branddna.keyword_presets";

function loadPresets(): Preset[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRESETS_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Preset[]) : [];
  } catch {
    return [];
  }
}

function savePresets(presets: Preset[]) {
  try {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* storage unavailable — presets stay in memory for this session */
  }
}

// Parses "keyword | group" lines; group is optional.
function parseKeywordLine(line: string): { phrase: string; group: string } | null {
  const [phrase, group] = line.split("|").map((s) => s.trim());
  if (!phrase || phrase.length < 2) return null;
  return { phrase, group: group || "" };
}

function csvCell(value: string | number) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const TREND_RANK: Record<string, number> = { rising: 3, flat: 2, falling: 1, unknown: 0 };

function KeywordsPage() {
  const dashboardFn = useServerFn(keywordDashboard);
  const researchFn = useServerFn(researchKeyword);

  const [database, setDatabase] = useState("us");
  const [raw, setRaw] = useState(
    "brand style guide | guides\nbrand guidelines template | guides\nlogo color palette | tools",
  );
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [focus, setFocus] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const parsed = useMemo(
    () =>
      raw
        .split("\n")
        .map(parseKeywordLine)
        .filter((k): k is { phrase: string; group: string } => k !== null)
        .slice(0, 10),
    [raw],
  );
  const keywords = useMemo(() => parsed.map((k) => k.phrase), [parsed]);
  const groupByPhrase = useMemo(
    () => new Map(parsed.filter((k) => k.group).map((k) => [k.phrase, k.group])),
    [parsed],
  );
  const groups = useMemo(
    () => [...new Set(parsed.map((k) => k.group).filter(Boolean))],
    [parsed],
  );

  const dash = useMutation({
    mutationFn: async () => dashboardFn({ data: { keywords, database } }),
  });

  const detail = useMutation({
    mutationFn: async (keyword: string) => {
      setFocus(keyword);
      return researchFn({ data: { keyword, database } });
    },
  });

  const result = dash.data?.ok ? dash.data.result : null;
  const deep = detail.data?.ok ? detail.data.result : null;
  const marketName = MARKETS.find(([c]) => c === database)?.[1] ?? database;

  const rows = useMemo(() => {
    if (!result) return [];
    const minV = filters.minVolume === "" ? null : Number(filters.minVolume);
    const maxV = filters.maxVolume === "" ? null : Number(filters.maxVolume);
    const minD = filters.minDifficulty === "" ? null : Number(filters.minDifficulty);
    const maxD = filters.maxDifficulty === "" ? null : Number(filters.maxDifficulty);
    const filtered = result.metrics.filter((m) => {
      if (!m.found) return true;
      if (minV !== null && m.volume < minV) return false;
      if (maxV !== null && m.volume > maxV) return false;
      if (minD !== null && m.difficulty < minD) return false;
      if (maxD !== null && m.difficulty > maxD) return false;
      if (filters.intent !== "any" && !m.intents.includes(filters.intent)) return false;
      if (filters.trend !== "any" && m.trendDirection !== filters.trend) return false;
      if (filters.group !== "any" && (groupByPhrase.get(m.phrase) ?? "") !== filters.group)
        return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (a.found !== b.found) return a.found ? -1 : 1;
      return (b[sortKey] as number) - (a[sortKey] as number);
    });
  }, [result, sortKey, filters, groupByPhrase]);

  const filtersActive =
    JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const hiddenCount = result ? result.metrics.length - rows.length : 0;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <header className="mb-10 max-w-2xl">
          <h1 className="font-display text-4xl font-light sm:text-5xl">
            Keyword <em className="italic">dashboard</em>
          </h1>
          <p className="mt-3 font-sans text-sm italic leading-relaxed text-muted-foreground">
            Track up to ten phrases side by side — monthly searches, how hard they look to rank for,
            what the searcher wants, and how demand has moved over the last year. Semrush estimates
            for {marketName}.
          </p>
        </header>

        <section className={`${card} mb-10`}>
          <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
            <div>
              <label className={label} htmlFor="keywords">
                Keywords — one per line, up to ten
              </label>
              <textarea
                id="keywords"
                rows={5}
                className={`${field} mt-2 resize-y`}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={"brand style guide | guides"}
              />
              <p className="mt-2 font-sans text-[12px] text-muted-foreground">
                {keywords.length} phrase{keywords.length === 1 ? "" : "s"} ready — add{" "}
                <span className="font-mono">| group</span> to tag a keyword with a group you can
                filter by
              </p>
            </div>
            <div>
              <label className={label} htmlFor="market">
                Market
              </label>
              <select
                id="market"
                className={`${field} mt-2`}
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
              >
                {MARKETS.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                className={`${button} mt-4`}
                disabled={keywords.length === 0 || dash.isPending}
                onClick={() => dash.mutate()}
              >
                {dash.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Search className="h-3.5 w-3.5" aria-hidden />
                )}
                {dash.isPending ? "Loading" : "Build dashboard"}
              </button>
            </div>
          </div>

          {dash.isError && <div className="mt-4"><Note>Could not load the dashboard. Try again.</Note></div>}
          {dash.data && !dash.data.ok && <div className="mt-4"><Note>{dash.data.error}</Note></div>}
        </section>

        {result && (
          <>
            <div className="mb-8 grid gap-3 sm:grid-cols-4">
              {[
                ["Total monthly searches", fmt(result.totals.totalVolume)],
                [
                  "Average difficulty",
                  result.totals.avgDifficulty
                    ? `${Math.round(result.totals.avgDifficulty)}/100`
                    : "Unknown",
                ],
                ["Average cost per click", money(result.totals.avgCpc)],
                ["Rising in demand", `${result.totals.rising} of ${result.totals.withData}`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border-subtle p-4">
                  <p className={label}>{k}</p>
                  <p className="mt-2 font-display text-3xl">{v}</p>
                </div>
              ))}
            </div>

            <section className={`${card} mb-10`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-2xl">Every keyword</h2>
                <div className="flex items-center gap-2">
                  <label className={label} htmlFor="sort">
                    Sort by
                  </label>
                  <select
                    id="sort"
                    className="rounded-md border border-border-subtle bg-card px-2 py-1 font-sans text-[13px]"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                  >
                    <option value="volume">Search volume</option>
                    <option value="difficulty">Difficulty</option>
                    <option value="cpc">Cost per click</option>
                    <option value="trendChange">Trend</option>
                  </select>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-3">
                {(
                  [
                    ["minVolume", "Searches from"],
                    ["maxVolume", "Searches to"],
                    ["minDifficulty", "Difficulty from"],
                    ["maxDifficulty", "Difficulty to"],
                  ] as const
                ).map(([key, lbl]) => (
                  <div key={key} className="w-28">
                    <label className={label} htmlFor={`f-${key}`}>
                      {lbl}
                    </label>
                    <input
                      id={`f-${key}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="mt-1 w-full rounded-md border border-border-subtle bg-card px-2 py-1 font-sans text-[13px]"
                      value={filters[key]}
                      onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div>
                  <label className={label} htmlFor="f-intent">
                    Intent
                  </label>
                  <select
                    id="f-intent"
                    className="mt-1 rounded-md border border-border-subtle bg-card px-2 py-1 font-sans text-[13px]"
                    value={filters.intent}
                    onChange={(e) => setFilters((f) => ({ ...f, intent: e.target.value }))}
                  >
                    <option value="any">Any</option>
                    <option value="Informational">Informational</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Transactional">Transactional</option>
                    <option value="Navigational">Navigational</option>
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="f-trend">
                    Trend
                  </label>
                  <select
                    id="f-trend"
                    className="mt-1 rounded-md border border-border-subtle bg-card px-2 py-1 font-sans text-[13px]"
                    value={filters.trend}
                    onChange={(e) => setFilters((f) => ({ ...f, trend: e.target.value }))}
                  >
                    <option value="any">Any</option>
                    <option value="rising">Rising</option>
                    <option value="flat">Steady</option>
                    <option value="falling">Falling</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
                {groups.length > 0 && (
                  <div>
                    <label className={label} htmlFor="f-group">
                      Group
                    </label>
                    <select
                      id="f-group"
                      className="mt-1 rounded-md border border-border-subtle bg-card px-2 py-1 font-sans text-[13px]"
                      value={filters.group}
                      onChange={(e) => setFilters((f) => ({ ...f, group: e.target.value }))}
                    >
                      <option value="any">Any</option>
                      {groups.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                      <option value="">Ungrouped</option>
                    </select>
                  </div>
                )}
                {filtersActive && (
                  <button
                    className="font-mono text-[11px] uppercase tracking-[0.1em] underline decoration-border-subtle underline-offset-4 hover:decoration-foreground"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                  >
                    Clear filters{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
                  </button>
                )}
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className={th}>Keyword</th>
                      <th className={th}>Searches / mo</th>
                      <th className={th}>Difficulty</th>
                      <th className={th}>Intent</th>
                      <th className={th}>12-month trend</th>
                      <th className={th}>Change</th>
                      <th className={th}>CPC</th>
                      <th className={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className={`${td} italic text-muted-foreground`}
                        >
                          No keywords match the current filters.
                        </td>
                      </tr>
                    )}
                    {rows.map((m) => (
                      <tr key={m.phrase} className="border-b border-border-subtle">
                        <td className={td}>
                          {m.phrase}
                          {groupByPhrase.get(m.phrase) && (
                            <span className="ml-2 rounded-full border border-border-subtle px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                              {groupByPhrase.get(m.phrase)}
                            </span>
                          )}
                        </td>
                        {m.found ? (
                          <>
                            <td className={td}>{fmt(m.volume)}</td>
                            <td className={td}>
                              <Difficulty value={m.difficulty} />
                            </td>
                            <td className={td}>
                              <Intents intents={m.intents} />
                            </td>
                            <td className={`${td} text-foreground`}>
                              <Sparkline values={m.trend} />
                            </td>
                            <td className={td}>
                              <TrendBadge
                                direction={m.trendDirection as Trend}
                                change={m.trendChange}
                              />
                            </td>
                            <td className={td}>{money(m.cpc)}</td>
                            <td className={td}>
                              <button
                                className="font-mono text-[11px] uppercase tracking-[0.1em] underline decoration-border-subtle underline-offset-4 hover:decoration-foreground"
                                onClick={() => detail.mutate(m.phrase)}
                                disabled={detail.isPending}
                              >
                                {detail.isPending && focus === m.phrase ? "Loading" : "Expand"}
                              </button>
                            </td>
                          </>
                        ) : (
                          <td className={`${td} italic text-muted-foreground`} colSpan={7}>
                            No data for this phrase in {marketName}.
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 font-sans text-[12px] italic text-muted-foreground">
                The trend line shows relative demand month to month, not absolute searches. Intent is
                Semrush's read of what the searcher is after.
              </p>
            </section>
          </>
        )}

        {detail.data && !detail.data.ok && <div className="mb-10"><Note>{detail.data.error}</Note></div>}

        {deep && (
          <section className={card}>
            <h2 className="font-display text-2xl">
              Inside "{deep.keyword}"
            </h2>
            {!deep.overview.found ? (
              <div className="mt-4">
                <Note>No detail available for this phrase in {marketName}.</Note>
              </div>
            ) : (
              <div className="mt-6 grid gap-8 md:grid-cols-2">
                {[
                  ["Related phrases", deep.related],
                  ["Questions people ask", deep.questions],
                ].map(([title, list]) => (
                  <div key={title as string}>
                    <h3 className="font-display text-xl">{title as string}</h3>
                    {(list as typeof deep.related).length === 0 ? (
                      <p className="mt-2 font-sans text-[13px] italic text-muted-foreground">
                        Nothing came back for this one.
                      </p>
                    ) : (
                      <table className="mt-3 w-full border-collapse">
                        <thead>
                          <tr className="border-b border-border-subtle">
                            <th className={th}>Phrase</th>
                            <th className={th}>Searches</th>
                            <th className={th}>Diff.</th>
                            <th className={th}>Intent</th>
                            <th className={th}>Trend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(list as typeof deep.related).map((r) => (
                            <tr key={r.phrase} className="border-b border-border-subtle">
                              <td className={td}>{r.phrase}</td>
                              <td className={td}>{fmt(r.volume)}</td>
                              <td className={td}>
                                {r.difficulty ? Math.round(r.difficulty) : "—"}
                              </td>
                              <td className={td}>
                                <Intents intents={r.intents} />
                              </td>
                              <td className={td}>
                                <TrendBadge
                                  direction={r.trendDirection as Trend}
                                  change={r.trendChange}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <p className="mt-10 font-sans text-[12px] italic text-muted-foreground">
          All figures are Semrush estimates for Google organic search in {marketName} — not measured
          visits.
        </p>
      </main>
    </div>
  );
}
