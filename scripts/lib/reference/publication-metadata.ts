import { setTimeout as delay } from "node:timers/promises";
import { validPmid } from "../../../src/lib/catalogues/publication-format.ts";
import { SOURCES } from "../config.ts";

export const PUBMED_SUMMARIES = SOURCES.pubmed;
interface PubMedSummary {
  uid?: string;
  error?: string;
  authors?: { name: string; authtype?: string }[];
  pubdate?: string;
  epubdate?: string;
  fulljournalname?: string;
  source?: string;
}
const clean = (value: string | undefined) => (value || "").replace(/\s+/g, " ").trim();

/** Preserve collective authors; remove initials only from PubMed's personal-author form. */
export function publicationLabel(summary: PubMedSummary): string | null {
  if (summary.error) return null;
  const authors = summary.authors || [],
    first = authors[0];
  let author = clean(first?.name);
  if (first?.authtype === "Author") author = author.replace(/\s+[A-Z][A-Z.-]*$/, "");
  let journal = clean(summary.fulljournalname).split(/\s+:\s+/)[0] || clean(summary.source);
  if (journal.length > 65) journal = clean(summary.source) || journal;
  // PubMed's full journal name lowercases this established title.
  if (/^plos medicine$/i.test(journal)) journal = "PLoS Medicine";
  journal = journal.charAt(0).toUpperCase() + journal.slice(1);
  const year = /\b\d{4}\b/.exec(summary.pubdate || summary.epubdate || "")?.[0];
  if (!author || !journal || !year) return null;
  const label = `${author}${authors.length > 1 ? " et al." : ""}, ${journal} ${year}`;
  return label.length <= 500 ? label : null;
}

/** No titles/abstracts are published. A failed response must never become a cached 'missing'. */
export function parsePublicationResponse(value: unknown, requested: string[]) {
  const response = value as { error?: unknown; result?: Record<string, unknown> } | null;
  if (!response?.result || response.error) throw new Error("Invalid PubMed summary response");
  const labels: Record<string, string | null> = {};
  for (const id of requested) {
    const item = response.result[id] as PubMedSummary | undefined;
    if (!validPmid(id) || !item || (item.uid !== id && !item.error))
      throw new Error(`PubMed did not return the requested PMID ${id}`);
    if (item.error && !/cannot get document summary|invalid uid/i.test(item.error))
      throw new Error(`PubMed could not read PMID ${id}: ${item.error}`);
    labels[id] = publicationLabel(item);
  }
  return labels;
}

/** One sequential, rate-limited client for the whole offline job (including retries). */
export function publicationFetcher(fetcher: typeof fetch = fetch) {
  let lastRequest = 0;
  return async (ids: string[]) => {
    for (let attempt = 0; ; attempt++) {
      await delay(Math.max(0, 350 - (Date.now() - lastRequest)));
      lastRequest = Date.now();
      try {
        const response = await fetcher(PUBMED_SUMMARIES, {
          method: "POST",
          body: new URLSearchParams({
            db: "pubmed",
            id: ids.join(","),
            retmode: "json",
            tool: "genomewalk",
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`PubMed HTTP ${response.status}`);
        }
        return parsePublicationResponse(await response.json(), ids);
      } catch (error) {
        if (attempt === 3) throw error;
        await delay(1000 * 2 ** attempt);
      }
    }
  };
}
