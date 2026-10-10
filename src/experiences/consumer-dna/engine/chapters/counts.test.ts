import type { ConsumerCall } from "../../types.ts";
import {
  mockDocument,
  type TestElement,
  testElement,
} from "../../../../../tests/helpers/fixture.ts";
import { fixture as partialFixture } from "../../../../../tests/helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { runConsumerChapter } from "../../chapters.ts";
import { sampleConsumerRows } from "./row-examples.ts";
import { ctx, selectSource } from "../context.ts";
import { openConsumerFile } from "../../reader.ts";

function output(t: test.TestContext) {
  const original = globalThis.document;
  globalThis.document = mockDocument();
  t.after(() => {
    globalThis.document = original;
    selectSource(null);
  });
  return testElement("div");
}

const source = (
  readCalls: (
    each: (
      call: Pick<ConsumerCall, "chrom" | "pos" | "alleles" | "status" | "canMatch"> &
        Partial<Pick<ConsumerCall, "id" | "fields">>,
    ) => void,
    progress: (fraction: number) => void,
  ) => Promise<void>,
) => ({
  format: "consumer",
  provider: "23andMe",
  header: {},
  capabilities: { matching: true },
  readCalls,
});
const call = {
  chrom: "1",
  pos: 100,
  alleles: ["C", "T"],
  status: "called" as const,
  canMatch: true,
};

test("count boxes update during a scan and give way to a collapsed summary when it finishes", async (t) => {
  const out = output(t);
  let release!: () => void, started!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const scanning = new Promise<void>((resolve) => {
    started = resolve;
  });
  let scans = 0;
  selectSource(
    partialFixture(
      source(async (each, progress) => {
        scans++;
        each(call);
        each(call);
        progress(0.5);
        started();
        await pending;
        each({ ...call, pos: 200, alleles: [null, null], status: "no-call", canMatch: false });
        progress(1);
      }),
    ),
  );
  const percentages: number[] = [];
  const run = runConsumerChapter(3, out, { onProgress: (fraction) => percentages.push(fraction) });
  await scanning;
  assert.deepEqual(percentages, [0, 0.5]);
  const live = out.children[0]!.children.find((child) => child.className === "tiles");
  assert.ok(live);
  assert.deepEqual(
    [...live.innerHTML.matchAll(/class="tv">(.*?)</g)].map((m) => m[1]),
    ["2", "1", "2"],
  );
  assert.deepEqual(
    out.children[0]!.children.map((child) => child.className),
    ["tiles"],
  );
  assert.equal(out.children.filter((child) => child.tagName === "details").length, 0);

  release();
  await run;
  assert.equal(percentages.at(-1), 1);
  const assertFinished = (element: TestElement) => {
    assert.ok(element.children.length >= 5);
    assert.ok(element.children.every((child: { tagName: string }) => child.tagName === "details"));
    const html = element.children.map((child) => child.innerHTML).join("\n");
    assert.match(html, /Reported rows<\/span><b><code>3<\/code>/);
    assert.match(html, /Distinct sites<\/span><b><code>2<\/code>/);
    assert.doesNotMatch(html, /row-map|<details open|class="tiles"/);
  };
  assertFinished(out);

  const revisited = testElement("div");
  await runConsumerChapter(3, revisited);
  assertFinished(revisited);
  assert.equal(scans, 1, "revisiting uses cached counts");
});

test("a failed scan removes its temporary count boxes without showing completed results", async (t) => {
  const out = output(t);
  selectSource(
    partialFixture(
      source(async () => {
        throw new Error("read failed");
      }),
    ),
  );
  await assert.rejects(runConsumerChapter(3, out), /read failed/);
  assert.equal(out.children.length, 0);
});

test("a skipped-ahead summary reports progress while preparing the file counts", async (t) => {
  const out = output(t);
  selectSource(
    partialFixture(
      source(async (each, progress) => {
        each(call);
        progress(0.13);
        each({ ...call, pos: 200 });
        progress(1);
      }),
    ),
  );
  const values: number[] = [];
  await runConsumerChapter(4, out, { onProgress: (fraction) => values.push(fraction) });
  assert.deepEqual(values, [0, 0.13, 1, 1]);
  assert.ok(out.children.every((child) => child.className !== "prog"));
  assert.equal(ctx.stats!.records, 2);
});

const storyHTML = (out: TestElement) => out.children.map((child) => child.innerHTML).join("\n");
const diagramHTML = (html: string) =>
  html.match(/<figure class="consumer-row-map file-row-map"[\s\S]*?<\/figure>/)![0];
const groupHTML = (html: string, kind: string) =>
  html.split(`class="row-map-group row-map-${kind}"`)[1]?.split('class="row-map-group')[0];
const profileFile = (
  provider: string,
  data: string[][],
  metadata = "# reference build 37; forward strand",
) => {
  const columns =
    provider === "23andMe"
      ? "rsid\tchromosome\tposition\tgenotype"
      : "rsid\tchromosome\tposition\tallele1\tallele2";
  const lines = data.map(([id, chrom, pos, gt]) =>
    [id, chrom, pos, ...(provider === "23andMe" ? [gt] : [...gt!.replaceAll("-", "0")])].join("\t"),
  );
  return new File([`# ${provider}\n${metadata}\n${columns}\n${lines.join("\n")}`], "example.txt");
};

for (const provider of ["23andMe", "AncestryDNA"]) {
  test(`${provider} annotated rows retain real values, explain eligibility and link to detail text`, async (t) => {
    const out = output(t);
    const data = [
      ["<example>", "1", "100", "CT"],
      ["rs2", "1", "100", "TC"],
      ["rs3", "1", "100", "CC"],
      ["rs4", "1", "200", "--"],
      ["rs5", "1", "300", "A-"],
      ["i6", "1", "400", "II"],
      ["i7", "1", "500", "DD"],
      ["rs8", "X", "600", "AA"],
    ];
    selectSource(await openConsumerFile(profileFile(provider, data)));
    await runConsumerChapter(2, out);
    const html = storyHTML(out);
    assert.equal(ctx.stats, null, "examples do not publish whole-file counts");
    assert.match(html, /marker name \(<code>&lt;example&gt;<\/code>\)/);
    assert.match(html, /chromosome 1, position 100/);
    assert.match(html, /no allele values were reported/);
    assert.match(html, provider === "23andMe" ? /<code>--<\/code>/ : /<code>0 \/ 0<\/code>/);
    assert.match(html, /A partial call/);
    assert.match(html, /insertions \(added DNA\) and deletions \(removed DNA\)/);
    const diagram = diagramHTML(html);
    assert.match(diagram, /Rows side by side/);
    assert.doesNotMatch(diagram, /row-map-totals|Whole file/);
    assert.match(diagram, /first 8 rows read/);
    assert.match(diagram, /class="row-map-number">Row 1<\/span>/);
    assert.match(diagram, /class="row-map-number">Row 3<\/span>/);
    assert.match(diagram, /&lt;example&gt;/);
    assert.match(diagram, /One C and one T/);
    assert.match(diagram, /Two rows, one site/);
    assert.match(diagram, /No-call/);
    assert.match(diagram, /I\/D codes/);
    for (const id of ["rs3", "rs4", "rs5", "i6", "i7", "rs8"]) assert.ok(diagram.includes(id));
    assert.doesNotMatch(diagram, /rs2/);
    assert.match(groupHTML(diagram, "letters")!, /row-map-status is-matchable/);
    assert.match(groupHTML(diagram, "missing")!, /row-map-status is-omitted/);
    assert.match(groupHTML(diagram, "missing")!, /No DNA letters to compare/);
    assert.match(groupHTML(diagram, "partial")!, /Part of the call is missing/);
    assert.match(groupHTML(diagram, "codes")!, /I\/D codes do not give the DNA letters needed/);
    assert.match(groupHTML(diagram, "outside")!, /Chromosome X is outside the supported 1–22/);
    assert.match(
      groupHTML(diagram, "repeat")!,
      /site is omitted from results after the repeat check/,
    );
    for (const [, id] of diagram.matchAll(/href="#(count-[a-z]+)"/g)) {
      const target = html.match(new RegExp(`<details\\b([^>]*\\bid="${id}"[^>]*)><summary>`));
      assert.ok(target, `link resolves to collapsible ${id}`);
      assert.doesNotMatch(target[1]!, /\bopen\b/, `${id} starts collapsed`);
      assert.ok(html.indexOf(`id="${id}"`) > html.indexOf("</figure>"));
    }
    for (const column of ctx.source!.header.columns)
      assert.ok(diagram.includes(`<dt>${column}</dt>`));
    assert.doesNotMatch(
      html,
      /<example>|undefined|NaN|<pre>|Which rows are matchable|Here are selected real rows|consumer-count-chart|extra rows|starting pool|findings|diagnosis|differing records/,
    );
    assert.equal(ctx.rowExamples!.examples.conflicting!.earlier!.id, "<example>");
    assert.equal(ctx.rowExamples!.examples.conflicting!.call.id, "rs3");
    assert.equal(ctx.rowExamples!.examples.conflicting!.earlier!.fileRow, 1);
    assert.equal(ctx.rowExamples!.examples.conflicting!.call.fileRow, 3);
    assert.equal(
      Reflect.get(ctx.rowExamples!.examples, "rows"),
      undefined,
      "do not retain arbitrary opening rows",
    );
  });

  test(`${provider} genuine conflicting DNA rows remain selectable after a coded first row`, async (t) => {
    const out = output(t);
    selectSource(
      await openConsumerFile(
        profileFile(provider, [
          ["iFirst", "1", "100", "II"],
          ["rsFirst", "1", "100", "CC"],
          ["rsBetween", "1", "200", "AA"],
          ["rsLater", "1", "100", "CT"],
        ]),
      ),
    );
    await runConsumerChapter(2, out);
    const { conflicting } = ctx.rowExamples!.examples;
    assert.deepEqual(conflicting!.earlier!.alleles, ["C", "C"]);
    assert.deepEqual(conflicting!.call.alleles, ["C", "T"]);
    assert.equal(conflicting!.earlier!.fileRow, 2);
    const repeats = groupHTML(diagramHTML(storyHTML(out)), "repeat");
    assert.match(
      repeats!,
      provider === "23andMe"
        ? /rsFirst[\s\S]*?<dd>CC<\/dd>/
        : /rsFirst[\s\S]*?<dd>C<\/dd>[\s\S]*?<dd>C<\/dd>/,
    );
    assert.match(
      repeats!,
      provider === "23andMe"
        ? /rsLater[\s\S]*?<dd>CT<\/dd>/
        : /rsLater[\s\S]*?<dd>C<\/dd>[\s\S]*?<dd>T<\/dd>/,
    );
    assert.doesNotMatch(repeats!, /rsBetween/);
  });
}

test("matching is unavailable at file level without a supported build", async (t) => {
  const out = output(t);
  selectSource(
    await openConsumerFile(
      profileFile(
        "23andMe",
        [
          ["rs1", "1", "100", "CT"],
          ["rs2", "X", "200", "AA"],
        ],
        "# forward strand",
      ),
    ),
  );
  await runConsumerChapter(2, out);
  const html = storyHTML(out);
  assert.equal(ctx.rowExamples!.eligible, 0);
  assert.match(html, /Matching is unavailable/);
  assert.match(html, /The file’s build or reading direction is not supported/);
  assert.doesNotMatch(html, /row-map-status is-matchable/);
});

test("identical file rows are both shown while one reused example is not shown twice", async (t) => {
  const out = output(t);
  selectSource(
    await openConsumerFile(
      profileFile("23andMe", [
        ["rs1", "1", "100", "AG"],
        ["rs1", "1", "100", "AG"],
        ["rs2", "1", "200", "--"],
      ]),
    ),
  );
  await runConsumerChapter(2, out);
  const html = storyHTML(out);
  const repeats = groupHTML(diagramHTML(html), "repeat");
  assert.equal([...repeats!.matchAll(/<dd>rs1<\/dd>/g)].length, 2);
  assert.match(repeats!, /class="row-map-number">Row 1<\/span>/);
  assert.match(repeats!, /class="row-map-number">Row 2<\/span>/);
  assert.match(repeats!, /Agreeing repeats are combined/);
  assert.match(html, /the rows named <code>rs1<\/code> both point to/);
});

test("a mixed-code repeat uses both real rows without inventing DNA calls", async (t) => {
  const out = output(t);
  selectSource(
    await openConsumerFile(
      profileFile("23andMe", [
        ["i1", "1", "100", "II"],
        ["rs1", "1", "100", "CC"],
      ]),
    ),
  );
  await runConsumerChapter(2, out);
  const html = storyHTML(out);
  const repeats = groupHTML(diagramHTML(html), "repeat");
  assert.match(repeats!, /<dd>i1<\/dd>[\s\S]*?<dd>II<\/dd>/);
  assert.match(repeats!, /<dd>rs1<\/dd>[\s\S]*?<dd>CC<\/dd>/);
  assert.match(repeats!, /Different row checks/);
  assert.match(html, /<code>i1<\/code> and <code>rs1<\/code> both point to/);
  assert.doesNotMatch(html, /Illustrative|made-up|different reported values|contradict/);
});

test("files without repeats or missing calls do not claim nonexistent examples", async (t) => {
  const out = output(t);
  selectSource(await openConsumerFile(profileFile("23andMe", [["rs1", "1", "100", "AG"]])));
  await runConsumerChapter(2, out);
  const html = storyHTML(out);
  assert.doesNotMatch(html, /<pre>/);
  const diagram = diagramHTML(html);
  assert.match(diagram, /One A and one G/);
  assert.doesNotMatch(diagram, /row-map-end|Only selected examples/);
  assert.doesNotMatch(diagram, /No-call|Two rows, one site|I\/D codes|Partial call/);
  assert.doesNotMatch(html, /dots stand|row above shows|both point to|outside the matching rules:/);
});

test("an insertion-only file uses its real code and no fabricated deletion example", async (t) => {
  const out = output(t);
  selectSource(await openConsumerFile(profileFile("23andMe", [["i1", "1", "100", "II"]])));
  await runConsumerChapter(2, out);
  const html = storyHTML(out);
  assert.match(html, /<code>II<\/code> example above/);
  const diagram = diagramHTML(html);
  assert.match(diagram, /<dd>i1<\/dd>[\s\S]*?<mark>II<\/mark>/);
  assert.match(diagram, /I\/D codes/);
  assert.doesNotMatch(diagram, /Standard row|<mark>DD<\/mark>|No-call/);
  assert.doesNotMatch(html, /<code>DD<\/code>|made-up|A C G T/);
});

test("the diagram selects a matchable example even when the first row is outside the supported chromosomes", async (t) => {
  const out = output(t);
  selectSource(
    await openConsumerFile(
      profileFile("23andMe", [
        ["rsX", "X", "100", "TT"],
        ["rsAutosome", "2", "200", "AC"],
      ]),
    ),
  );
  await runConsumerChapter(2, out);
  const diagram = diagramHTML(storyHTML(out));
  assert.match(groupHTML(diagram, "letters")!, /rsAutosome/);
  assert.match(groupHTML(diagram, "letters")!, /row-map-status is-matchable/);
  assert.match(groupHTML(diagram, "outside")!, /rsX/);
  assert.match(groupHTML(diagram, "outside")!, /row-map-status is-omitted/);
});

test("a one-letter autosomal call is omitted for ploidy, not mistaken for a missing call", async (t) => {
  const out = output(t);
  selectSource(
    await openConsumerFile(
      profileFile("23andMe", [
        ["rsDiploid", "1", "100", "AA"],
        ["rsHaploid", "1", "200", "A"],
      ]),
    ),
  );
  await runConsumerChapter(2, out);
  const excluded = groupHTML(diagramHTML(storyHTML(out)), "outside");
  assert.match(excluded!, /rsHaploid/);
  assert.match(excluded!, /This row does not report two DNA letters/);
  assert.match(excluded!, /row-map-status is-omitted/);
  assert.doesNotMatch(excluded!, /No DNA letters to compare/);
});

test("example sampling stops at its limit and never replaces full-file statistics", async (t) => {
  const out = output(t);
  let reads = 0;
  const selected = source(async (each) => {
    for (let i = 0; i < 12; i++) {
      reads++;
      each({ ...call, pos: i + 1, id: `rs${i}`, fields: [`rs${i}`, "1", String(i + 1), "CT"] });
    }
  });
  selectSource(partialFixture(selected));
  const preview = await sampleConsumerRows(partialFixture(selected), { limit: 10 });
  assert.equal(reads, 10);
  assert.equal(preview.records, 10);
  assert.equal(ctx.stats, null);
  await runConsumerChapter(3, out);
  assert.equal(ctx.stats!.records, 12);
  assert.equal(reads, 22);
  const revisited = testElement("div");
  await runConsumerChapter(2, revisited);
  assert.equal(reads, 22, "the example chapter can reuse an already completed scan");
});
