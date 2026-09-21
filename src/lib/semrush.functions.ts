import { createServerFn } from "@tanstack/react-start";
import {
  CompetitorCompareInputSchema,
  KeywordDashboardInputSchema,
  KeywordResearchInputSchema,
  SemrushError,
  compareCompetitorsImpl,
  keywordDashboardImpl,
  keywordResearchImpl,
} from "@/server/semrush.server";


function fail(e: unknown) {
  if (e instanceof SemrushError) return { ok: false as const, error: e.message };
  console.error("[semrush] unexpected failure", e);
  return { ok: false as const, error: "Something went wrong fetching the search data." };
}

export const compareCompetitors = createServerFn({ method: "POST" })
  .inputValidator((data) => CompetitorCompareInputSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      return { ok: true as const, result: await compareCompetitorsImpl(data) };
    } catch (e) {
      return fail(e);
    }
  });

export const researchKeyword = createServerFn({ method: "POST" })
  .inputValidator((data) => KeywordResearchInputSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      return { ok: true as const, result: await keywordResearchImpl(data) };
    } catch (e) {
      return fail(e);
    }
  });

export const keywordDashboard = createServerFn({ method: "POST" })
  .inputValidator((data) => KeywordDashboardInputSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      return { ok: true as const, result: await keywordDashboardImpl(data) };
    } catch (e) {
      return fail(e);
    }
  });
