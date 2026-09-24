# Brand build-out becomes a full go-to-market plan

## What the user gets
Drop in a site or PDF, then run the Brand builder. When it finishes, the build-out now keeps going in one flow:

1. **Brand directions** (as today): market summary, competitors, 3 directions.
2. **Top keywords**: 15–25 keywords picked for what the business actually does. For local businesses they use the city or area (for example "roofer in Austin", "Austin roof repair"). Each keyword shows monthly searches, difficulty, intent and trend. Keywords are grouped by topic, and each one has a priority label (quick win, core, long-term).
3. **Competitor edge**: your site compared with the top 2–3 local rivals found in research. It shows shared keywords, gap keywords (ones they rank for and you don't), and a plain-language list of where you can win.
4. **Marketing plan**: launch-to-market steps in three tracks:
   - **SEO**: which pages to build, what each targets, title and description ideas.
   - **AEO** (answer engines): question-style FAQs and short answers built from the keyword questions.
   - **GEO** (AI search / local): Google Business Profile, local citations, reviews, location pages, and the content AI assistants tend to cite.
   Plus a 30/60/90-day roadmap and the first 5 actions to take.

Everything saves to the kit automatically as each step finishes. It's also added to the **Save brand package** zip as KEYWORDS.csv, COMPETITOR-EDGE.md and MARKETING-PLAN.md. Every keyword row has a "Research in Keywords" link that opens the existing Keywords page with that phrase.

## Flow on the kit page
```text
Analyze -> Confirm profile -> Build directions -> Keywords -> Competitor edge -> Marketing plan -> Done
```
A progress list shows each stage. If one stage fails (for example, the search data allowance runs out), the stages before it stay saved, and a "Retry this step" button appears.

## Search data caveat
The Semrush monthly allowance is currently used up. Until it resets, keywords and competitor numbers fall back to estimates from live web research plus AI, and they're clearly labeled "estimated". When Semrush is available, real numbers are used automatically.

## Technical details
- `src/server/brand-builder.server.ts`: add `buildKeywordSet(profile, direction, research)`. AI proposes 40 localized candidates, then Semrush `keywordDashboardImpl` enriches them in one batch (with a fallback to AI estimates tagged `estimated: true`). Then `clusterKeywords` groups them, and the top 25 are scored by volume, difficulty and intent.
- `buildCompetitorEdge`: reuses `compareCompetitorsImpl` with the kit domain plus rival domains from `market.competitors`. The AI then summarizes the advantages. If there's no kit domain, it uses a research-only comparison.
- `buildMarketingPlan`: one `aiJSON` call (strict schema: seo[], aeo[], geo[], roadmap{d30,d60,d90}, firstActions[]).
- `src/lib/brand-builder.functions.ts`: three new server fns (`buildKeywords`, `buildCompetitorEdge`, `buildMarketingPlan`). Each takes kitId+ownerToken, calls `assertKitOwner`, and merges its result into `brand_kits.brand_build` (keys `keywords`, `edge`, `plan`). `analyzeKitForBuilder` returns them in `saved`.
- `src/components/brand-builder.tsx`: chains the stages automatically after directions, plus a stage progress list, keyword table, edge panel and plan panel, with per-stage retry. It resumes from the first missing stage on reload.
- `src/lib/exports.ts`: the package gains KEYWORDS.csv, COMPETITOR-EDGE.md and MARKETING-PLAN.md in `brand-build-out/`.
- Keywords link: `/keywords?q=<phrase>`, and the Keywords page reads `q` to prefill.
- No database changes (uses the existing `brand_build` jsonb).
