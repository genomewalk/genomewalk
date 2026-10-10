import type { IndexOptions, ResultIndexEntry, IndexedSuggestion } from "./types.ts";
import { escape } from "../view/html.ts";

// Index once; typing and category changes never reclassify the genome's matches.
export function createResultIndex<T>(
  hits: T[],
  { textOf, categoriesOf, suggestionsOf }: IndexOptions<T>,
) {
  const counts = new Map<string, number>();
  const suggestions = new Map<string, IndexedSuggestion>();
  const index = hits.map((h) => {
    const categories = [...new Set(categoriesOf(h))];
    for (const category of categories) counts.set(category, (counts.get(category) || 0) + 1);
    for (const { v, kind } of suggestionsOf(h)) {
      if (v && !suggestions.has(`${kind}:${v}`))
        suggestions.set(`${kind}:${v}`, { v, kind, l: v.toLowerCase() });
    }
    return { h, t: textOf(h).toLowerCase(), categories };
  });
  return { index, counts, suggestions: [...suggestions.values()] };
}

export function filterResults<T>(index: ResultIndexEntry<T>[], query: string, category = "all") {
  const phrase = query.toLowerCase().trim();
  const words = phrase.split(/\s+/).filter(Boolean);
  const scoped =
    category === "all" ? index : index.filter((row) => row.categories.includes(category));
  const byPhrase = phrase ? scoped.filter(({ t }) => t.includes(phrase)) : scoped;
  // Prefer the complete phrase; fall back to all words anywhere within a result.
  return byPhrase.length || !words.length
    ? byPhrase
    : scoped.filter(({ t }) => words.every((word) => t.includes(word)));
}

export function highlightMatch(value: string, needle: string) {
  const index = value.toLowerCase().indexOf(needle);
  return index < 0
    ? escape(value)
    : `${escape(value.slice(0, index))}<mark>${escape(value.slice(index, index + needle.length))}</mark>${escape(value.slice(index + needle.length))}`;
}
