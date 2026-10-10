import type { ConsumerSource } from "../../types.ts";
import type { Progress } from "../../../../lib/io/types.ts";
import type { ConsumerCounts } from "../../types.ts";
import { ctx, ensureStats } from "../context.ts";
import { el, fmt, tile, kvx, splitBar } from "../view/html.ts";

const countTiles = (stats: Pick<ConsumerCounts, "records" | "duplicates" | "called">) =>
  tile("Reported rows", fmt(stats.records), "all data rows in this export") +
  tile(
    "Distinct sites",
    fmt(stats.records - stats.duplicates),
    "unique chromosome/position pairs",
  ) +
  tile("Base calls", fmt(stats.called), "rows with complete A/C/G/T calls");

export async function runCounts(
  source: ConsumerSource,
  out: HTMLElement,
  _signal?: AbortSignal,
  onProgress?: Progress,
) {
  const counting = el("div");
  out.append(counting);
  const live = el("div", "tiles", countTiles({ records: 0, duplicates: 0, called: 0 }));
  counting.append(live);
  let stats;
  try {
    if (!ctx.stats) onProgress?.(0);
    stats = await ensureStats((fraction, counts) => {
      onProgress?.(fraction);
      live.innerHTML = countTiles(counts);
    });
  } finally {
    counting.remove();
  }
  renderCounts(stats, source, out);
}

export function renderCounts(
  stats: Awaited<ReturnType<typeof ensureStats>>,
  source: ConsumerSource,
  out: HTMLElement,
) {
  const value = (n: number | null | undefined) => `<code>${fmt(n)}</code>`;
  out.append(
    kvx(
      "Reported rows",
      value(stats.records),
      `<p>Every data line in the export counts as a row, including missing calls and repeated sites.</p>
     ${splitBar([
       { label: "DNA-letter calls", n: stats.called, tone: "teal" },
       { label: "No-calls", n: stats.missing, tone: "stone" },
       { label: "Partial calls", n: stats.partial, tone: "blue" },
       { label: "I/D codes", n: stats.unsupported, tone: "gold" },
     ])}`,
    ),
  );
  out.append(
    kvx(
      "Distinct sites",
      value(stats.unique),
      `<p>A site is one <b>chromosome + position</b>. Your <b>${fmt(stats.records)} rows</b> describe
     <b>${fmt(stats.unique)} different sites</b>. ${
       stats.duplicates
         ? `${fmt(stats.duplicates)} rows revisit a site already listed. Agreeing repeats are combined for results; conflicting sites are omitted.`
         : "Each site appears once."
     }</p>
     ${stats.conflicts ? `<p><b>${fmt(stats.conflicts)} sites</b> have conflicting calls.</p>` : ""}
     <p>Chapter 3 explains how repeated rows work.</p>`,
    ),
  );
  out.append(
    kvx(
      "DNA-letter calls",
      value(stats.called),
      `<p>Rows with complete A/C/G/T calls. These include single-letter calls and calls on X, Y or mitochondrial DNA; not all meet our matching rules.</p>`,
    ),
  );
  out.append(
    kvx(
      "No-calls",
      value(stats.missing),
      `<p>The site is listed, but no allele was reported. These rows are omitted from matching.</p>`,
    ),
  );
  if (stats.partial)
    out.append(
      kvx(
        "Partial calls",
        value(stats.partial),
        `<p>Part of the call is missing. These rows are omitted from matching.</p>`,
      ),
    );
  if (stats.unsupported)
    out.append(
      kvx(
        "I/D codes",
        value(stats.unsupported),
        `<p>Insertion and deletion codes do not spell out the DNA letters. Our current matching tools omit them.</p>`,
      ),
    );
  out.append(
    kvx(
      "Matchable rows",
      value(stats.eligible),
      `<p>${
        source.capabilities.matching
          ? "Matching requires two reported A/C/G/T letters, neither missing, on chromosomes 1–22."
          : "This file’s reference build or reading direction is not supported for matching."
      }
     These are row checks, before repeated sites are resolved or a catalogue is searched.</p>
     ${splitBar([
       { label: "Matchable", n: stats.eligible, tone: "green" },
       { label: "Omitted", n: stats.records - stats.eligible, tone: "stone" },
     ])}`,
    ),
  );
}
