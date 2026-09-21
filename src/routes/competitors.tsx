import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Search, Swords } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { compareCompetitors, researchKeyword } from "@/lib/semrush.functions";

export const Route = createFileRoute("/competitors")({
  head: () => ({
    meta: [
      { title: "Competitors & keyword research — Brand DNA" },
      {
        name: "description",
        content:
          "Compare your site against competitors on organic search, see which keywords you share, find their keyword gaps, and research demand for any phrase.",
      },
      { property: "og:title", content: "Competitors & keyword research — Brand DNA" },
      {
        property: "og:description",
        content:
          "Compare your site against competitors on organic search, see shared keywords and gaps, and research demand for any phrase.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/competitors" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/competitors" }],
  }),
  component: CompetitorsPage,
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
const input =
  "w-full rounded-md border border-border-subtle bg-card px-3 py-2 font-sans text-sm text-foreground outline-none focus:border-foreground";
const button =
  "inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 font-mono text-[12px] uppercase tracking-[0.12em] text-background transition-opacity hover:opacity-90 disabled:opacity-40";
const card = "rounded-xl border border-border-subtle bg-card p-5";
const th = "px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground";
const td = "px-3 py-2 align-top font-sans text-[13px]";

const fmt = (n: number) => (n >= 1000 ? n.toLocaleString("en-US") : String(Math.round(n)));
const money = (n: number) => `$${n.toFixed(2)}`;

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-border-subtle bg-surface px-3 py-2 font-sans text-[13px] italic text-muted-foreground">
      {children}
    </p>
  );
}

function CompetitorsPage() {
  const compareFn = useServerFn(compareCompetitors);
  const researchFn = useServerFn(researchKeyword);

  const [database, setDatabase] = useState("us");
  const [yourDomain, setYourDomain] = useState("");
  const [rivals, setRivals] = useState(["", "", ""]);
  const [keyword, setKeyword] = useState("");

  const compare = useMutation({
    mutationFn: async () => {
      const domains = [yourDomain, ...rivals].map((d) => d.trim()).filter(Boolean);
      return compareFn({ data: { domains, database, keywordLimit: 50 } });
    },
  });

  const research = useMutation({
    mutationFn: async () => researchFn({ data: { keyword: keyword.trim(), database } }),
  });

  const cmp = compare.data?.ok ? compare.data.result : null;
  const kw = research.data?.ok ? research.data.result : null;
  const marketName = MARKETS.find(([c]) => c === database)?.[1] ?? database;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <header className="mb-10 max-w-2xl">
          <h1 className="font-display text-4xl font-light sm:text-5xl">
            Competitors &amp; <em className="italic">keywords</em>
          </h1>
          <p className="mt-3 font-sans text-sm italic leading-relaxed text-muted-foreground">
            Search estimates from Semrush for {marketName}. Compare your site against up to three
            rivals, see the keywords you share, the ones only they rank for, and the demand behind
            any phrase.
          </p>
        </header>

        <div className="mb-8 max-w-xs">
          <label className={label} htmlFor="market">
            Market
          </label>
          <select
            id="market"
            className={`${input} mt-2`}
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
          >
            {MARKETS.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* ---------- Competitor comparison ---------- */}
        <section className={`${card} mb-12`}>
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <Swords className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Compare domains
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="your-domain">
                Your site
              </label>
              <input
                id="your-domain"
                className={`${input} mt-2`}
                placeholder="yoursite.com"
                value={yourDomain}
                onChange={(e) => setYourDomain(e.target.value)}
              />
            </div>
            {rivals.map((r, i) => (
              <div key={i}>
                <label className={label} htmlFor={`rival-${i}`}>
                  Competitor {i + 1}
                </label>
                <input
                  id={`rival-${i}`}
                  className={`${input} mt-2`}
                  placeholder="competitor.com"
                  value={r}
                  onChange={(e) =>
                    setRivals((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                  }
                />
              </div>
            ))}
          </div>

          <button
            className={`${button} mt-5`}
            disabled={!yourDomain.trim() || compare.isPending}
            onClick={() => compare.mutate()}
          >
            {compare.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Swords className="h-3.5 w-3.5" aria-hidden />
            )}
            {compare.isPending ? "Comparing" : "Compare"}
          </button>

          {compare.isError && <div className="mt-4"><Note>Could not run the comparison. Try again.</Note></div>}
          {compare.data && !compare.data.ok && (
            <div className="mt-4"><Note>{compare.data.error}</Note></div>
          )}

          {cmp && (
            <div className="mt-8 space-y-10">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className={th}>Domain</th>
                      <th className={th}>Organic keywords</th>
                      <th className={th}>Est. monthly traffic</th>
                      <th className={th}>Traffic value</th>
                      <th className={th}>Paid keywords</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cmp.snapshots.map((s) => (
                      <tr key={s.domain} className="border-b border-border-subtle">
                        <td className={`${td} font-mono text-[12px]`}>{s.domain}</td>
                        {s.error ? (
                          <td className={`${td} italic text-muted-foreground`} colSpan={4}>
                            {s.error}
                          </td>
                        ) : (
                          <>
                            <td className={td}>{fmt(s.organicKeywords)}</td>
                            <td className={td}>{fmt(s.organicTraffic)}</td>
                            <td className={td}>{money(s.organicCost)}</td>
                            <td className={td}>{fmt(s.paidKeywords)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {cmp.overlaps.length > 0 && (
                <div>
                  <h3 className="font-display text-xl">Keyword overlap</h3>
                  <p className="mt-1 font-sans text-[13px] italic text-muted-foreground">
                    Based on each site's top keywords by traffic, not its full keyword set.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {cmp.overlaps.map((o) => (
                      <div key={o.domain} className="rounded-lg border border-border-subtle p-4">
                        <p className="font-mono text-[11px] uppercase tracking-[0.14em]">
                          {o.domain}
                        </p>
                        <p className="mt-2 font-display text-3xl">{o.sharedCount}</p>
                        <p className="font-sans text-[12px] text-muted-foreground">
                          shared of {o.sampleSize} sampled
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {cmp.matrix.length > 0 && (
                <div>
                  <h3 className="font-display text-xl">Cross analysis</h3>
                  <p className="mt-1 font-sans text-[13px] italic text-muted-foreground">
                    Where each site ranks for the same phrase. Lower position is better; a dash means
                    it wasn't in that site's sampled keywords.
                  </p>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse">
                      <thead>
                        <tr className="border-b border-border-subtle">
                          <th className={th}>Keyword</th>
                          <th className={th}>Volume</th>
                          {cmp.snapshots.map((s) => (
                            <th key={s.domain} className={th}>
                              {s.domain}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cmp.matrix.map((m) => (
                          <tr key={m.phrase} className="border-b border-border-subtle">
                            <td className={td}>{m.phrase}</td>
                            <td className={td}>{fmt(m.volume)}</td>
                            {cmp.snapshots.map((s) => (
                              <td key={s.domain} className={`${td} font-mono text-[12px]`}>
                                {m.positions[s.domain] ? `#${m.positions[s.domain]}` : "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {cmp.overlaps.some((o) => o.gaps.length > 0) && (
                <div className="space-y-6">
                  <h3 className="font-display text-xl">Their keywords, not yours</h3>
                  {cmp.overlaps.map((o) =>
                    o.gaps.length === 0 ? null : (
                      <div key={o.domain}>
                        <p className="font-mono text-[11px] uppercase tracking-[0.14em]">
                          {o.domain}
                        </p>
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full min-w-[520px] border-collapse">
                            <thead>
                              <tr className="border-b border-border-subtle">
                                <th className={th}>Keyword</th>
                                <th className={th}>Volume</th>
                                <th className={th}>Their position</th>
                                <th className={th}>CPC</th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.gaps.map((g) => (
                                <tr key={g.phrase} className="border-b border-border-subtle">
                                  <td className={td}>{g.phrase}</td>
                                  <td className={td}>{fmt(g.volume)}</td>
                                  <td className={`${td} font-mono text-[12px]`}>#{g.position}</td>
                                  <td className={td}>{money(g.cpc)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ---------- Keyword research ---------- */}
        <section className={card}>
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <Search className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Keyword research
          </h2>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className={label} htmlFor="keyword">
                Phrase
              </label>
              <input
                id="keyword"
                className={`${input} mt-2`}
                placeholder="brand style guide"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && keyword.trim().length > 1) research.mutate();
                }}
              />
            </div>
            <button
              className={button}
              disabled={keyword.trim().length < 2 || research.isPending}
              onClick={() => research.mutate()}
            >
              {research.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Search className="h-3.5 w-3.5" aria-hidden />
              )}
              {research.isPending ? "Looking" : "Research"}
            </button>
          </div>

          {research.isError && <div className="mt-4"><Note>Could not run that search. Try again.</Note></div>}
          {research.data && !research.data.ok && (
            <div className="mt-4"><Note>{research.data.error}</Note></div>
          )}

          {kw && !kw.overview.found && (
            <div className="mt-4">
              <Note>No data for "{kw.keyword}" in {marketName}. Try a broader phrase or another market.</Note>
            </div>
          )}

          {kw && kw.overview.found && (
            <div className="mt-8 space-y-8">
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  ["Monthly searches", fmt(kw.overview.volume)],
                  ["Difficulty", kw.overview.difficulty ? `${Math.round(kw.overview.difficulty)}/100` : "Unknown"],
                  ["Cost per click", money(kw.overview.cpc)],
                  ["Ad competition", kw.overview.competition.toFixed(2)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-border-subtle p-4">
                    <p className={label}>{k}</p>
                    <p className="mt-2 font-display text-3xl">{v}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                {[
                  ["Related phrases", kw.related],
                  ["Questions people ask", kw.questions],
                ].map(([title, list]) => (
                  <div key={title as string}>
                    <h3 className="font-display text-xl">{title as string}</h3>
                    {(list as typeof kw.related).length === 0 ? (
                      <p className="mt-2 font-sans text-[13px] italic text-muted-foreground">
                        Nothing came back for this one.
                      </p>
                    ) : (
                      <table className="mt-3 w-full border-collapse">
                        <thead>
                          <tr className="border-b border-border-subtle">
                            <th className={th}>Phrase</th>
                            <th className={th}>Volume</th>
                            <th className={th}>Difficulty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(list as typeof kw.related).map((r) => (
                            <tr key={r.phrase} className="border-b border-border-subtle">
                              <td className={td}>{r.phrase}</td>
                              <td className={td}>{fmt(r.volume)}</td>
                              <td className={td}>
                                {r.difficulty ? Math.round(r.difficulty) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <p className="mt-10 font-sans text-[12px] italic text-muted-foreground">
          All figures are Semrush estimates for Google organic search in {marketName} — not measured
          visits.
        </p>
      </main>
    </div>
  );
}
