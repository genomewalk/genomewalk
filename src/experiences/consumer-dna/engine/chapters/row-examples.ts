import type {
  CallSource,
  ConsumerSource,
  ConsumerCall,
  ConsumerCounts,
  CountExamples,
} from "../../types.ts";
import type { Progress } from "../../../../lib/io/types.ts";
import { ctx } from "../context.ts";
import { consumerStats } from "../../reader.ts";
import { el, escape, fmt } from "../view/html.ts";
import { rowDiagram } from "../view/row-diagram.ts";

// A bounded preview gives this chapter real examples without doing chapter 4's
// full count. The same bound applies when finding an earlier repeated row.
export async function sampleConsumerRows(
  source: CallSource,
  { limit = 50000, signal }: { limit?: number; signal?: AbortSignal | undefined } = {},
) {
  const preview = {
    ...source,
    async readCalls(
      each: (call: ConsumerCall) => void,
      progress?: Progress | null,
      readSignal?: AbortSignal,
    ) {
      let rows = 0;
      const stop = Symbol("enough example rows");
      try {
        await source.readCalls(
          (call) => {
            each(call);
            if (++rows >= limit) throw stop;
          },
          progress,
          readSignal,
        );
      } catch (error) {
        if (error !== stop) throw error;
      }
    },
  };
  return consumerStats(preview, undefined, signal);
}

export async function runRowExamples(
  source: ConsumerSource,
  out: HTMLElement,
  signal?: AbortSignal,
) {
  const stats = ctx.stats || ctx.rowExamples || (await sampleConsumerRows(source, { signal }));
  signal?.throwIfAborted();
  if (ctx.source !== source) throw new DOMException("The selected genome changed.", "AbortError");
  ctx.rowExamples = stats;
  renderRowExamples(stats, source, out);
}

const reported = (call: ConsumerCall) => `<code>${escape(call.fields.slice(3).join(" / "))}</code>`;
const repeatExample = (examples: CountExamples) =>
  examples.conflicting || examples.repeated || examples.anyRepeated;

function rowIntroduction(call: ConsumerCall | undefined) {
  if (!call?.fields)
    return "It records a marker name, an address in the genome, and the reported call at that address.";
  return `The first row records a marker name (<code>${escape(call.id)}</code>), an address in the genome (<b>chromosome ${escape(call.chrom)}, position ${fmt(call.pos)}</b>), and ${call.status === "called" ? "the alleles reported at that position" : "the reported call"} (${reported(call)}).`;
}

function siteExplanation(stats: ConsumerCounts, examples: CountExamples) {
  const repeat = repeatExample(examples);
  const repeatedRows = repeat?.earlier?.fields && repeat.call?.fields;
  const explanation = !stats.duplicates
    ? "No repeated site appears in these examples."
    : repeatedRows
      ? `Multiple rows can represent the same site. Above, ${repeat.earlier!.id === repeat.call.id ? `the rows named <code>${escape(repeat.call.id)}</code>` : `<code>${escape(repeat.earlier!.id)}</code> and <code>${escape(repeat.call.id)}</code>`} both point to <b>chromosome ${escape(repeat.call.chrom)}, position ${fmt(repeat.call.pos)}</b>.`
      : "Multiple rows can represent the same site, so we count each different address once.";
  return `<p>A <b>site</b> is one location in the genome: a <b>chromosome + position</b>. ${explanation}</p>${stats.duplicates ? "<p>For results, we combine agreeing repeats into one result per site and allele. If records at a site disagree, we omit that site rather than choose one answer.</p>" : ""}`;
}

function missingExplanation(stats: ConsumerCounts, examples: CountExamples) {
  const missing = examples["no-call"];
  return `<p><b>A no-call</b> means no allele values were reported at that site.${missing?.fields ? ` The <code>${escape(missing.id)}</code> row above shows ${reported(missing)}: the DNA letters there are unknown.` : !stats.missing ? " Your file has no no-call rows." : " The site is listed, but its DNA letters are unknown."}</p>`;
}

function codedExplanation(stats: ConsumerCounts, examples: CountExamples) {
  const codes = [examples.insertion || examples.unsupported, examples.deletion].filter(
    (call): call is NonNullable<typeof call> => Boolean(call?.fields),
  );
  const values = [...new Set(codes.map(reported))];
  return `<p><b>I/D codes</b> stand for insertions (added DNA) and deletions (removed DNA).${values.length ? ` The ${values.join(" and ")} ${values.length === 1 ? "example above uses" : "examples above use"} these codes; they do not spell out which DNA letters were added or removed.` : !stats.unsupported ? " No complete I/D-coded calls were found in this file." : " These codes do not spell out which DNA letters were added or removed."}</p>`;
}

export function renderRowExamples(stats: ConsumerCounts, source: ConsumerSource, out: HTMLElement) {
  const examples = stats.examples || {};
  const detail = (kind: string, title: string, body: string) =>
    `<details class="kvx consumer-count-detail" id="count-${kind}"><summary><span>${title}</span><i class="kvx-caret" aria-hidden="true">+</i></summary><div class="kvx-body">${body}</div></details>`;
  out.append(
    el(
      "div",
      "consumer-count-story",
      `
    <p>${rowIntroduction(examples.first)}</p>
    ${rowDiagram(stats, source, { showSummary: false })}
    ${examples.matchable || examples.called ? detail("letters", "Standard row", `<p>Each letter is an allele reported at that address. To pass the row checks, a row needs two A/C/G/T letters, neither missing, on chromosomes <b>1–22</b>.</p>`) : ""}
    ${examples["no-call"] ? detail("missing", "No-call", missingExplanation(stats, examples)) : ""}
    ${examples.partial ? detail("partial", "Partial call", `<p><b>A partial call</b> has a reported letter or code and a missing part. Above, <code>${escape(examples.partial.id)}</code> reports ${reported(examples.partial)}; the missing part is unknown. We omit these rows from matching.</p>`) : ""}
    ${detail("repeat", "Rows and sites", siteExplanation(stats, examples))}
    ${examples.unsupported ? detail("codes", "I/D codes", codedExplanation(stats, examples)) : ""}
    ${examples.outsideMatching ? detail("outside", "Other DNA-letter rows", `<p>These rows report DNA letters but fall outside our matching rules${source.capabilities.matching ? " — for example, a site on X, Y or mitochondrial DNA, or a call with just one letter. This does not mean the answer is wrong." : " because the file’s reference build or reading direction is not supported."}</p>`) : ""}
    <p>The next chapter, <b>Count everything</b>, gives the totals for your whole file.</p>
  `,
    ),
  );
}
