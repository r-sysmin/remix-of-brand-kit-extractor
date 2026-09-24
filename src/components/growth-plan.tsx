import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, Loader2, RotateCcw, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildGrowthStage,
  type CompetitorEdge,
  type KeywordSet,
  type MarketingPlan,
} from "@/lib/brand-builder.functions";

export type Growth = { keywords: KeywordSet | null; edge: CompetitorEdge | null; plan: MarketingPlan | null };
type Stage = "keywords" | "edge" | "plan";
const STAGES: Array<{ id: Stage; label: string }> = [
  { id: "keywords", label: "Top keywords" },
  { id: "edge", label: "Competitor edge" },
  { id: "plan", label: "Marketing plan (SEO · AEO · GEO)" },
];

export function GrowthPlan({
  kitId,
  ownerToken,
  directionIndex,
  value,
  onChange,
  autoRun,
}: {
  kitId: string;
  ownerToken: string;
  directionIndex: number;
  value: Growth;
  onChange: (g: Growth) => void;
  autoRun: boolean;
}) {
  const runStage = useServerFn(buildGrowthStage);
  const [running, setRunning] = useState<Stage | null>(null);
  const [failed, setFailed] = useState<{ stage: Stage; message: string } | null>(null);
  const cur = useRef(value);
  cur.current = value;

  async function runFrom(start?: Stage) {
    setFailed(null);
    let g = { ...cur.current };
    const order = STAGES.map((s) => s.id);
    const from = start ? order.indexOf(start) : order.findIndex((s) => !g[s]);
    if (from < 0) return;
    for (const stage of order.slice(from)) {
      setRunning(stage);
      try {
        const r = await runStage({ data: { kitId, ownerToken, stage, directionIndex } });
        g = { ...g, ...r };
        onChange(g);
      } catch (e: any) {
        setFailed({ stage, message: e?.message ?? "This step failed." });
        setRunning(null);
        return;
      }
    }
    setRunning(null);
  }

  const started = useRef(false);
  useEffect(() => {
    if (autoRun && !started.current && (!value.keywords || !value.edge || !value.plan)) {
      started.current = true;
      void runFrom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  const complete = value.keywords && value.edge && value.plan;
  const { keywords: kw, edge, plan } = value;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[color:var(--border-subtle)] p-5 sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">// GO-TO-MARKET</p>
        <ol className="mt-3 space-y-2 text-sm">
          {STAGES.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              {running === s.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : value[s.id] ? (
                <Check className="h-4 w-4" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={value[s.id] ? "" : "text-muted-foreground"}>{s.label}</span>
              {failed?.stage === s.id && (
                <>
                  <span className="text-[var(--accent)]">— {failed.message}</span>
                  <Button size="sm" variant="outline" onClick={() => runFrom(s.id)}>
                    <RotateCcw className="mr-1 h-3 w-3" /> Retry this step
                  </Button>
                </>
              )}
            </li>
          ))}
        </ol>
        {!running && !failed && (
          <Button className="mt-4" variant={complete ? "outline" : "default"} onClick={() => runFrom(complete ? "keywords" : undefined)}>
            {complete ? "Rebuild keywords & plan" : "Build keywords & marketing plan"}
          </Button>
        )}
        {running && <p className="mt-3 text-xs text-muted-foreground">Each step takes about a minute. Finished steps are saved right away.</p>}
      </div>

      {kw && (
        <div className="rounded-2xl border border-[color:var(--border-subtle)] p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            // TOP KEYWORDS · {kw.database.toUpperCase()}{kw.estimated ? " · ESTIMATED" : ""}
          </p>
          {kw.note && <p className="mt-2 text-xs text-muted-foreground">{kw.note}</p>}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Keyword</th>
                  <th className="py-2 pr-3">Searches/mo</th>
                  <th className="py-2 pr-3">Difficulty</th>
                  <th className="py-2 pr-3">Intent</th>
                  <th className="py-2 pr-3">Group</th>
                  <th className="py-2 pr-3">Priority</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {kw.keywords.map((k) => (
                  <tr key={k.phrase} className="border-t border-[color:var(--border-subtle)]">
                    <td className="py-2 pr-3 font-medium">
                      {k.phrase}
                      {k.local && <span className="ml-2 font-mono text-[9px] uppercase text-muted-foreground">local</span>}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{k.estimated ? "~" : ""}{k.volume.toLocaleString()}</td>
                    <td className="py-2 pr-3 tabular-nums">{k.difficulty}</td>
                    <td className="py-2 pr-3">{k.intent}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{k.group}</td>
                    <td className="py-2 pr-3">{k.priority}</td>
                    <td className="py-2 text-right">
                      <Link to="/keywords" search={{ q: k.phrase }} className="text-xs underline-offset-4 hover:underline">
                        Research
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {edge && (
        <div className="rounded-2xl border border-[color:var(--border-subtle)] p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            // COMPETITOR EDGE{edge.estimated ? " · FROM RESEARCH" : ""}
          </p>
          {edge.note && <p className="mt-2 text-xs text-muted-foreground">{edge.note}</p>}
          {edge.rivals.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {edge.rivals.map((r) => (
                <li key={r.domain}>
                  <span className="font-medium">{r.name}</span> <span className="text-muted-foreground">({r.domain})</span>
                  {r.sharedKeywords !== null && <span className="text-muted-foreground"> · {r.sharedKeywords} shared keywords</span>}
                  {r.gapKeywords.length > 0 && <span className="text-muted-foreground"> · they rank for: {r.gapKeywords.slice(0, 5).join(", ")}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 grid gap-5 md:grid-cols-3">
            <List title="Your advantages" items={edge.advantages} />
            <List title="Threats" items={edge.threats} />
            <List title="Winning moves" items={edge.winningMoves} />
          </div>
        </div>
      )}

      {plan && (
        <div className="rounded-2xl border border-[color:var(--border-subtle)] p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">// MARKETING PLAN</p>
          <p className="mt-2 text-lg font-medium">{plan.headline}</p>
          <List title="Do this week" items={plan.firstActions} className="mt-4" />
          <h4 className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">SEO — pages</h4>
          <ul className="mt-2 space-y-3 text-sm">
            {plan.seo.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.page}</span> <span className="text-muted-foreground">→ “{s.targetKeyword}”</span>
                <div className="text-xs">Title: {s.title}</div>
                <div className="text-xs text-muted-foreground">Description: {s.metaDescription}</div>
              </li>
            ))}
          </ul>
          <h4 className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">AEO — answers</h4>
          <dl className="mt-2 space-y-3 text-sm">
            {plan.aeo.map((a, i) => (
              <div key={i}>
                <dt className="font-medium">{a.question}</dt>
                <dd className="text-muted-foreground">{a.answer}</dd>
              </div>
            ))}
          </dl>
          <h4 className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">GEO — local & AI search</h4>
          <ul className="mt-2 space-y-2 text-sm">
            {plan.geo.map((g, i) => (
              <li key={i}>
                <span className="font-medium">{g.action}</span> <span className="text-muted-foreground">— {g.detail}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            <List title="First 30 days" items={plan.roadmap.days30} />
            <List title="Days 31–60" items={plan.roadmap.days60} />
            <List title="Days 61–90" items={plan.roadmap.days90} />
          </div>
        </div>
      )}
    </div>
  );
}

function List({ title, items, className = "" }: { title: string; items: string[]; className?: string }) {
  return (
    <div className={className}>
      <h4 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{title}</h4>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
