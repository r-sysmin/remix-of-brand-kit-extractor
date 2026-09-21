// Automatic keyword clustering: groups phrases by shared topic words and,
// when Semrush intent data is available, by searcher intent.
// Pure and dependency-free so it can run in the browser.

export type ClusterEntry = { phrase: string; group: string };

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "best", "but", "by", "can", "do", "does",
  "for", "free", "from", "how", "i", "in", "is", "it", "me", "my", "near", "of", "on",
  "or", "s", "that", "the", "to", "top", "vs", "what", "when", "where", "which", "who",
  "why", "will", "with", "you", "your",
]);

// Crude but stable singularisation so "guides" and "guide" cluster together.
function stem(word: string) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && (word.endsWith("ses") || word.endsWith("xes"))) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokens(phrase: string) {
  return [
    ...new Set(
      phrase
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/[\s-]+/)
        .filter((w) => w.length > 1 && !STOPWORDS.has(w))
        .map(stem),
    ),
  ];
}

function titleCase(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function dominantIntent(intents: string[][]) {
  const counts = new Map<string, number>();
  for (const list of intents) for (const i of list) counts.set(i, (counts.get(i) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [intent, count] of counts) {
    if (count > bestCount) {
      best = intent;
      bestCount = count;
    }
  }
  // Only label the intent when most of the cluster agrees on it.
  return best && bestCount >= Math.ceil(intents.length / 2) ? best : null;
}

/**
 * Assigns every phrase a topic group. Phrases sharing their strongest topic word
 * form a cluster; the cluster label adds the dominant intent when one is clear.
 * Phrases with no shared word land in "Other".
 */
export function clusterKeywords(
  phrases: string[],
  intentByPhrase: Map<string, string[]> = new Map(),
): ClusterEntry[] {
  const tokenized = phrases.map((phrase) => ({ phrase, words: tokens(phrase) }));

  const freq = new Map<string, number>();
  for (const t of tokenized) for (const w of t.words) freq.set(w, (freq.get(w) ?? 0) + 1);

  const remaining = new Set(tokenized.map((t) => t.phrase));
  const assigned = new Map<string, string>();

  while (remaining.size > 0) {
    // Pick the word shared by the most unassigned phrases.
    const local = new Map<string, string[]>();
    for (const t of tokenized) {
      if (!remaining.has(t.phrase)) continue;
      for (const w of t.words) {
        const list = local.get(w) ?? [];
        list.push(t.phrase);
        local.set(w, list);
      }
    }
    let topWord: string | null = null;
    let members: string[] = [];
    for (const [word, list] of local) {
      const better =
        list.length > members.length ||
        (list.length === members.length && (freq.get(word) ?? 0) > (freq.get(topWord ?? "") ?? 0));
      if (list.length >= 2 && better) {
        topWord = word;
        members = list;
      }
    }

    if (!topWord) {
      for (const phrase of remaining) assigned.set(phrase, "Other");
      break;
    }

    const intent = dominantIntent(members.map((p) => intentByPhrase.get(p) ?? []));
    const name = intent ? `${titleCase(topWord)} · ${intent.toLowerCase()}` : titleCase(topWord);
    for (const phrase of members) {
      assigned.set(phrase, name);
      remaining.delete(phrase);
    }
  }

  return phrases.map((phrase) => ({ phrase, group: assigned.get(phrase) ?? "Other" }));
}
