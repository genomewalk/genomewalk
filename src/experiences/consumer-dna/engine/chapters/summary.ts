import type { ConsumerSource } from "../../types.ts";
import type { Progress } from "../../../../lib/io/types.ts";
import { ctx, ensureStats } from "../context.ts";
import { sexChromosomeFinding } from "../view/sex-chromosomes.ts";
import { chromosomeGallery } from "../../../../components/diagrams/chromosome-gallery.ts";
import { el, fmt, kvx, note } from "../view/html.ts";

export async function renderSummary(
  _source: ConsumerSource,
  out: HTMLElement,
  _signal?: AbortSignal,
  onProgress?: Progress,
) {
  if (!ctx.stats) onProgress?.(0);
  const stats = await ensureStats((fraction) => {
    onProgress?.(fraction);
  });
  const sexFinding = sexChromosomeFinding(stats.sexChromosomes);
  if (sexFinding) out.append(sexFinding);
  if (!stats.conflicts && stats.diploid)
    out.append(
      kvx(
        "Different alleles at a site",
        `<code>${fmt(stats.heterozygous)} / ${fmt(stats.diploid)}</code>`,
        "<p>Among distinct autosomal sites with complete two-letter calls, this many report two different alleles. The result depends on which sites the provider included; it is not a cross-provider quality score.</p>",
      ),
    );
  out.append(el("div", "sub", "Reported rows per chromosome:"));
  out.append(el("div", null, chromosomeGallery(stats.chrom)));
  out.append(
    note(
      "The illustrations show the distribution of rows in this export. They do not measure how much of each chromosome was sequenced. An absent site or chromosome is not evidence that it is biologically missing.",
    ),
  );
}
