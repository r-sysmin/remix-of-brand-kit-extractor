import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Sparkles, Check, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  analyzeKitForBuilder,
  buildBrandDirections,
  applyBrandDirection,
  type BrandDirection,
  type BrandProfile,
  type MarketReport,
} from "@/lib/brand-builder.functions";
import { GrowthPlan, type Growth } from "@/components/growth-plan";

const FIELD_LABELS: Record<keyof BrandProfile, { label: string; placeholder: string }> = {
  businessName: { label: "Business name", placeholder: "e.g. Lone Star Roasters" },
  offering: { label: "What you sell", placeholder: "e.g. specialty coffee and pastries" },
  location: { label: "City or region", placeholder: "e.g. San Antonio, Texas" },
  audience: { label: "Who you serve (optional)", placeholder: "e.g. commuters and remote workers" },
};

type Phase = "analyzing" | "ready" | "building" | "done" | "error";

export function BrandBuilderSection({ kitId, ownerToken, onApplied }: { kitId: string; ownerToken: string; onApplied: () => void }) {
  const analyze = useServerFn(analyzeKitForBuilder);
  const build = useServerFn(buildBrandDirections);
  const apply = useServerFn(applyBrandDirection);

  const [phase, setPhase] = useState<Phase>("analyzing");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<BrandProfile>({ businessName: "", offering: "", location: "", audience: "" });
  const [missing, setMissing] = useState<Array<keyof BrandProfile>>([]);
  const [thin, setThin] = useState(false);
  const [market, setMarket] = useState<MarketReport | null>(null);
  const [directions, setDirections] = useState<BrandDirection[]>([]);
  const [applying, setApplying] = useState<number | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [growth, setGrowth] = useState<Growth>({ keywords: null, edge: null, plan: null });
  const [growthDir, setGrowthDir] = useState(0);
  const [autoGrowth, setAutoGrowth] = useState(false);
  const [growthKey, setGrowthKey] = useState(0);

  useEffect(() => {
    let alive = true;
    analyze({ data: { kitId, ownerToken } })
      .then((r) => {
        if (!alive) return;
        setProfile(r.profile);
        setMissing(r.missing.filter((k) => k !== "audience" && k !== "businessName"));
        setThin(r.thin);
        if (r.saved?.directions?.length) {
          setMarket(r.saved.market);
          setDirections(r.saved.directions);
          setSavedAt(r.saved.savedAt);
          setGrowth({ keywords: r.saved.keywords, edge: r.saved.edge, plan: r.saved.plan });
          setGrowthDir(r.saved.growthDirection ?? 0);
          setPhase("done");
        } else setPhase("ready");
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message ?? "Could not read this kit.");
        setPhase("error");
      });
    return () => {
      alive = false;
    };
  }, [kitId, ownerToken, analyze]);

  const canBuild = profile.offering.trim().length > 1 && profile.location.trim().length > 1;

  async function run() {
    setPhase("building");
    setError(null);
    setApplied(null);
    try {
      const r = await build({ data: { kitId, ownerToken, profile } });
      setMarket(r.market);
      setDirections(r.directions);
      setSavedAt(r.savedAt);
      setGrowth({ keywords: null, edge: null, plan: null });
      setGrowthDir(0);
      setAutoGrowth(true);
      setGrowthKey((k) => k + 1);
      setPhase("done");
      toast.success("Build-out saved to this kit");
    } catch (e: any) {
      setError(e?.message ?? "Building failed.");
      setPhase("ready");
    }
  }

  async function choose(i: number) {
    setApplying(i);
    try {
      const r = await apply({ data: { kitId, ownerToken, direction: directions[i]!, location: profile.location } });
      setApplied(i);
      toast.success(`Added ${r.addedColors} colors, ${r.addedFonts} fonts, and a new voice`);
      onApplied();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not apply that direction.");
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[color:var(--border-subtle)] p-5 sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          // {thin ? "THIN KIT DETECTED" : "LOCAL MARKET BUILD-OUT"}
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {thin
            ? "This kit is light on detail. The builder studies your local market and competitors, then proposes three bold, locally-tuned brand directions you can add to the kit in one click."
            : "Research your local market and competitors to push this brand into three sharper, locally-tuned directions."}
        </p>

        {phase === "analyzing" && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading what your brand already says…
          </p>
        )}

        {phase === "error" && <p className="mt-4 text-sm text-[var(--accent)]">{error}</p>}

        {(phase === "ready" || phase === "building" || phase === "done") && (
          <div className="mt-5 space-y-4">
            {!missing.length && (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{profile.offering}</span>
                <span className="text-muted-foreground">in</span>
                <span className="font-medium">{profile.location}</span>
                <button
                  type="button"
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => setMissing(["offering", "location"])}
                >
                  edit
                </button>
              </p>
            )}
            {missing.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  We couldn't find this on your site — fill it in once:
                </p>
                {missing.map((k) => (
                  <div key={k} className="space-y-1.5">
                    <Label htmlFor={`bb-${k}`}>{FIELD_LABELS[k].label}</Label>
                    <Input
                      id={`bb-${k}`}
                      value={profile[k]}
                      placeholder={FIELD_LABELS[k].placeholder}
                      onChange={(e) => setProfile((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
            {error && <p className="text-sm text-[var(--accent)]">{error}</p>}
            <Button onClick={run} disabled={!canBuild || phase === "building"}>
              {phase === "building" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Researching {profile.location || "your market"}…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" /> {phase === "done" ? "Build again" : "Build out this brand"}
                </>
              )}
            </Button>
            {phase === "building" && (
              <p className="text-xs text-muted-foreground">
                Scanning local competitors, culture and trends. This usually takes about a minute.
              </p>
            )}
          </div>
        )}
      </div>

      {phase === "done" && market && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--border-subtle)] p-4">
            <p className="text-sm text-muted-foreground">
              Save everything — assets, tokens, voice, research and directions — as one brand package.
            </p>
            <Button
              variant="outline"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("branddna:download-package", {
                    detail: { market, directions, savedAt, chosen: applied, ...growth },
                  }),
                )
              }
            >
              <Package className="mr-2 h-4 w-4" /> Save brand package
            </Button>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-subtle)] p-5 sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              // LOCAL MARKET{savedAt ? ` · SAVED ${new Date(savedAt).toLocaleString()}` : ""}
            </p>
            <p className="mt-2 text-sm leading-relaxed">{market.summary}</p>
            {market.competitors.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm">
                {market.competitors.map((c, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CompetitorLogo url={c.url} name={c.name} />
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                        {c.name}
                      </a>
                    ) : (
                      <span className="font-medium">{c.name}</span>
                    )}
                    <span className="text-muted-foreground"> — {c.note}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {directions.map((d, i) => (
              <article key={i} className="flex flex-col rounded-2xl border border-[color:var(--border-subtle)] p-5">
                <div className="flex h-14 overflow-hidden rounded-lg">
                  {d.palette.map((c, j) => (
                    <div key={j} className="flex-1" style={{ background: c.hex }} title={`${c.name} ${c.hex} · ${c.role}`} />
                  ))}
                </div>
                <h3 className="mt-4 text-2xl tracking-tight [font-family:'Cormorant_Garamond',serif]">{d.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d.concept}</p>
                {d.taglines[0] && <p className="mt-3 text-base font-medium">“{d.taglines[0]}”</p>}
                <dl className="mt-4 space-y-3 text-sm">
                  <Row k="Positioning" v={d.positioning} />
                  <Row k="Audience" v={d.targetAudience} />
                  <Row k="The gap" v={d.competitorGap} />
                  <Row k="Type" v={`${d.headingFont} / ${d.bodyFont}`} />
                  <Row k="Logo" v={d.logoDirection} />
                  <Row k="Tone" v={d.tone.join(", ")} />
                  <Row k="Local cues" v={d.localCues.join(" · ")} />
                </dl>
                <p className="mt-4 rounded-lg bg-muted/40 p-3 text-sm italic">{d.sampleCopy}</p>
                <Button
                  className="mt-5"
                  variant={applied === i ? "secondary" : "default"}
                  disabled={applying !== null || applied === i}
                  onClick={() => choose(i)}
                >
                  {applying === i ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : applied === i ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : null}
                  {applied === i ? "Added to kit" : "Use this direction"}
                </Button>
              </article>
            ))}
          </div>

          <GrowthPlan
            key={growthKey}
            kitId={kitId}
            ownerToken={ownerToken}
            directionIndex={applied ?? growthDir}
            value={growth}
            onChange={setGrowth}
            autoRun={autoGrowth}
          />

          {market.sources.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Research sources ({market.sources.length})</summary>
              <ul className="mt-2 space-y-1">
                {market.sources.map((s, i) => (
                  <li key={i}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{k}</dt>
      <dd className="mt-0.5">{v}</dd>
    </div>
  );
}
