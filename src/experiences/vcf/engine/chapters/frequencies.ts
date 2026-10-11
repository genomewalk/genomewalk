import { ensureHeader } from "../runtime.ts";
import { buildGuard } from "../view/file.ts";
import { loadMarkers } from "../markers.ts";
import { hasStudyEvidence } from "../../../../lib/catalogues/study-evidence.ts";
import { storyBlock, studyLinks, featuredMarkers, markerRow } from "../view/markers.ts";
import { el, ext, SOURCES, note } from "../view/html.ts";
import { frequencyExampleIntro } from "../../../../lib/genetics/frequency-example.ts";
import { tallyFigure } from "../view/population.ts";
import { frequencyIndexPreview } from "../../../../lib/catalogues/catalogue-preview.ts";

export const frequenciesChapter = {
  title: "How common is it? — gnomAD",
  blurb: `how common each variant is, per ancestry — and what that can and cannot settle`,
  why: `gnomAD pools the genomes of roughly 800,000 people and counts, for every variant, how
          many allele copies were observed — overall and within each ancestry group. It answers one question,
          "how common is this?", and that one number is the best sanity check there is on any
          claim a catalogue makes. It is an interpretive layer, not a verdict about you. This
          chapter uses catalogue examples to show how to read those counts and what they can
          and cannot tell you.`,
  async run(out: HTMLElement) {
    await ensureHeader();
    if (!buildGuard(out)) return;
    const data = await loadMarkers();
    // Use the catalogue for this build without looking up the person's calls.
    const ex = data!.markers.find((m) => m.rs === "rs671" && hasStudyEvidence(m));
    const story = storyBlock(data!);
    out.append(
      el(
        "div",
        null,
        `
        ${frequencyExampleIntro(ex, ex ? studyLinks(ex) : "")}
        <p>A natural question about any variant is: <b>how many other people have this?</b> And a sharper one:
         <b>how many in their own ancestry group?</b> No single file can answer that. It takes a count
         across many people's genomes — and that is exactly what gnomAD is.</p>
        <p>${ext(SOURCES.gnomad, "<b>gnomAD</b>")} (the Genome Aggregation Database) is a public tally: for each variant, how
         many copies were seen among all the people sequenced, divided by how many copies were
         examined. That fraction is the variant's <b>frequency</b>. Because the people come from
         many backgrounds, it is also given per population — a variant can be common in one group
         and nearly absent in another. In a simplified example, ten people might look like this:</p>
        ${tallyFigure()}
        <p>The count is kept <b>per ancestry group</b>, and that is the real question gnomAD lets
         you ask: not "how common is this?" but "how common is this <em>in each group</em>?" The
         single "everyone" number can hide a whole continent behind a small average.</p>

        ${frequencyIndexPreview(data!)}

        <p class="sub">How to use the count</p>
        <p>A high allele frequency can weigh against a rare, highly penetrant disease explanation.
         It does not rule out every health association. The appropriate threshold depends on the
         condition, inheritance, penetrance and the population data available.</p>
        <table class="fmt"><thead><tr><th>Highest group</th><th>Band</th><th>How to read it</th></tr></thead><tbody>
          <tr><td class="fv">5% or more</td><td class="fk">common</td><td class="fd">Common alleles can still have trait, drug-response or susceptibility associations.</td></tr>
          <tr><td class="fv">1% – 5%</td><td class="fk">uncommon</td><td class="fd">Frequency needs condition-specific context; it is not a universal exclusion threshold.</td></tr>
          <tr><td class="fv">0.1% – 1%</td><td class="fk">rare</td><td class="fd">Rarity alone does not establish a harmful effect.</td></tr>
          <tr><td class="fv">below 0.1%</td><td class="fk">very rare</td><td class="fd">Very low frequency alone does not establish a harmful effect.</td></tr>
          <tr><td class="fv">no value</td><td class="fk">unknown</td><td class="fd">Missing data is not evidence that the allele is rare or absent.</td></tr>
        </tbody></table>
        <p class="mini">These bands are reading aids, not clinical classification rules.
         A recessive disorder usually involves relevant variants on both copies; a dominant
         disorder can involve one copy, but penetrance and the exact variant still matter.
         ${ext("https://www.ncbi.nlm.nih.gov/clinvar/docs/clinsig/", "ClinVar classification guidance")}.</p>

        ${story ? `<p class="sub">What it cannot settle</p>${story}` : ""}`,
      ),
    );

    // Catalogue examples are the same for every genome using this build.
    const featured = featuredMarkers(data!);
    if (!featured.length) return;
    out.append(el("div", "sub", `Catalogue examples — how common in each group:`));
    out.append(
      el(
        "p",
        "s-why",
        `These examples show differences between populations. Each box shows a gnomAD catalogue entry.
        Research sources provide context; gnomAD provides the frequencies.`,
      ),
    );
    for (const m of featured) out.append(markerRow(m!, data!)!);
    out.append(
      note(`These examples show why frequency and interpretation are separate: an allele can be common
        and still have a studied association. The next chapter introduces ClinVar classifications;
        Your results keeps these kinds of evidence distinct.`),
    );
  },
};
