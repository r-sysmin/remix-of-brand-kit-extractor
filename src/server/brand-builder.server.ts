// Server-only helpers for the thin-kit Brand Builder: local market research
// (Firecrawl search via the connector gateway) and structured AI output
// (Lovable AI Gateway Responses API, streamed).

const RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";
const FIRECRAWL_GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";
const MODEL = "openai/gpt-6-astra";

export async function aiJSON<T>(opts: {
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  effort?: "low" | "medium";
}): Promise<T> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this app.");
  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: opts.instructions,
      input: opts.input,
      stream: true,
      store: false,
      reasoning: { effort: opts.effort ?? "low" },
      text: {
        format: { type: "json_schema", name: opts.schemaName, strict: true, schema: opts.schema },
      },
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    if (res.status === 402) throw new Error("AI credits are used up. Add credits in Settings → Plans & credits.");
    if (res.status === 429) throw new Error("AI is busy right now — try again in a minute.");
    throw new Error(`AI request failed [${res.status}]: ${body.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let finalText: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        else if (ev.type === "response.completed") {
          const out = ev.response?.output ?? [];
          const joined = out
            .flatMap((o: any) => o.content ?? [])
            .filter((c: any) => c.type === "output_text")
            .map((c: any) => c.text)
            .join("");
          if (joined) finalText = joined;
        } else if (ev.type === "response.failed" || ev.type === "error") {
          throw new Error(ev.response?.error?.message ?? ev.message ?? "AI request failed");
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  const out = finalText ?? text;
  if (!out.trim()) throw new Error("AI returned an empty answer — please try again.");
  return JSON.parse(out) as T;
}

export type SearchHit = { title: string; url: string; snippet: string };

export async function localSearch(query: string, limit = 5): Promise<SearchHit[]> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovableKey || !connectionKey) return [];
  try {
    const res = await fetch(`${FIRECRAWL_GATEWAY}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectionKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit,
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
      }),
    });
    if (!res.ok) {
      console.error(`[brand-builder] search failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
      return [];
    }
    const json: any = await res.json();
    const items: any[] = Array.isArray(json.data) ? json.data : json.data?.web ?? [];
    return items.slice(0, limit).map((r) => ({
      title: String(r.title ?? r.metadata?.title ?? ""),
      url: String(r.url ?? r.metadata?.sourceURL ?? ""),
      snippet: String(r.markdown ?? r.description ?? "").replace(/\s+/g, " ").slice(0, 1200),
    }));
  } catch (e) {
    console.error("[brand-builder] search error", e);
    return [];
  }
}
