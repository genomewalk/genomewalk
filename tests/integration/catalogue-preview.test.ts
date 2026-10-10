import { fixture as partialFixture } from "../helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createGunzip, gunzipSync } from "node:zlib";
import { createInterface } from "node:readline";
import {
  frequencyIndexPreview,
  clinvarIndexPreview,
} from "../../src/lib/catalogues/catalogue-preview.ts";
import { loadClinvarExamples } from "../../src/lib/catalogues/clinvar-examples.ts";
import { RangeCatalogue } from "../../src/lib/catalogues/catalogue-ranges.ts";
import { clinvarChapterHtml } from "../../src/experiences/shared/clinvar-chapter.ts";

test("frequency previews use the loaded build and only three actual reference entries", () => {
  for (const build of ["GRCh37", "GRCh38"]) {
    const data = JSON.parse(
      partialFixture(
        fs.readFileSync(new URL(`../../public/ref/${build}/markers.json`, import.meta.url)),
      ),
    );
    const html = frequencyIndexPreview(data);
    assert.ok(html.includes(`<span class="catalogue-preview-meta">${build}</span>`));
    for (const record of data.markers.slice(0, 3)) {
      assert.ok(html.includes(`${record.chrom}:${record.pos}:${record.ref}:${record.alt}`));
      assert.ok(html.includes(record.rs));
    }
    assert.equal((html.match(/<tr>/g) || []).length, 4); // header and three records
    assert.ok(!html.includes(data.markers[3].rs));
  }
});

test("frequency previews distinguish zero, tiny frequencies and missing values", () => {
  const html = frequencyIndexPreview(
    partialFixture({
      build: "GRCh37",
      markers: [
        { chrom: "1", pos: 100, ref: "C", alt: "T", rs: "rs1", af: 0, pops: { eas: 1e-9 } },
      ],
    }),
  );
  assert.match(html, /<td>0%<\/td><td>&lt;0\.0001%<\/td><td>Not available<\/td>/);
  assert.equal(frequencyIndexPreview(partialFixture({ markers: [] })), "");
});

test("ClinVar previews read named fields, preserve claims and escape reference text", () => {
  const header = "#classification\talt\tchrom\tconditions\tpos\tref\tstars\tgene";
  const sample = [
    "Conflicting_classifications_of_pathogenicity\tT\t1\tExample_<condition>\t100\tC\t0\tGENE&1",
    "drug_response\tG\t2\t\t200\tA\t3\tGENE2",
    "Pathogenic\tA\t3\tExample\t300\tG\t\tGENE3",
    "Pathogenic\tG\t4\tNot in preview\t400\tC\t4\tGENE4",
  ];
  const html = clinvarIndexPreview(partialFixture({ build: "GRCh38", header, sample, n: 1234 }));
  assert.match(html, /<span class="catalogue-preview-meta">GRCh38<\/span>/);
  assert.match(html, /1:100:C:T/);
  assert.match(html, /Conflicting classifications of pathogenicity/);
  assert.match(html, /GENE&amp;1/);
  assert.match(html, /Example &lt;condition&gt;/);
  assert.match(html, /0 \/ 4 stars/);
  assert.match(html, /drug response/);
  assert.doesNotMatch(html, /GENE4|<condition>/);
  assert.equal(clinvarIndexPreview(partialFixture({ header, sample: [], n: 0 })), "");
  assert.equal(clinvarIndexPreview(partialFixture({ header: "#unsupported", sample, n: 4 })), "");
});

test("both builds render the same ClinVar examples through byte ranges as full catalogue rows", async (t) => {
  for (const build of ["GRCh37", "GRCh38"]) {
    const stream = fs.createReadStream(
      new URL(`../../public/ref/${build}/catalog.tsv.gz`, import.meta.url),
    );
    const decoded = stream.pipe(createGunzip());
    const lines = createInterface({ input: decoded, crlfDelay: Infinity });
    const map = new Map(),
      sample = [];
    let header = "",
      columns: string | string[] = [];
    try {
      for await (const line of lines) {
        if (line.startsWith("#")) {
          header = line;
          columns = line.slice(1).split("\t");
          continue;
        }
        if (!line) continue;
        if (sample.length < 6) sample.push(line);
        const fields = line.split("\t");
        if (["132807", "1131472", "39357"].includes(fields[columns.indexOf("variationid")]!)) {
          map.set(fields.slice(0, 4).join(":"), line);
          if (map.size === 3) break;
        }
      }
    } finally {
      lines.close();
      decoded.destroy();
      stream.destroy();
    }
    assert.equal(map.size, 3, `example entries available for ${build}`);
    const catalogue = { build, header, map, sample };
    const examples = await loadClinvarExamples(catalogue);
    const html = clinvarIndexPreview(catalogue, examples);
    for (const gene of ["PIK3CD", "SAMD11", "CYP2C19"])
      assert.ok(html.includes(`<td>${gene}</td>`));
    for (const variantKey of map.keys()) assert.ok(html.includes(variantKey));
    for (const stars of [1, 3, 4]) assert.ok(html.includes(`${stars} / 4 stars`));
    assert.match(html, /<td>Pathogenic<\/td>/);
    assert.match(html, /<td>Conflicting classifications of pathogenicity<\/td>/);
    assert.match(html, /<td>drug response<\/td>/);
    assert.match(html, /Clopidogrel response; CYP2C19: increased function/);
    assert.equal((html.match(/<tr>/g) || []).length, 4);
    assert.doesNotMatch(html, /Not recorded/);

    // Exercise the deployed locator format, not just a map of decoded TSV rows.
    const index = JSON.parse(
      partialFixture(
        gunzipSync(
          fs.readFileSync(
            new URL(`../../public/ref/${build}/catalog.index.json.gz`, import.meta.url),
          ),
        ),
      ),
    );
    const file = fs.openSync(
      new URL(`../../public/ref/${build}/catalog.tsv.gz`, import.meta.url),
      "r",
    );
    t.after(() => fs.closeSync(file));
    let requests = 0;
    const rangeMap = new RangeCatalogue(index, "/catalog.tsv.gz", async (_, { headers } = {}) => {
      assert.match(new Headers(headers).get("Range")!, /^bytes=\d+-\d+$/);
      const [, start, end] = /bytes=(\d+)-(\d+)/
        .exec(new Headers(headers).get("Range")!)!
        .map(Number);
      const bytes = Buffer.alloc(end! - start! + 1);
      assert.equal(fs.readSync(file, bytes, 0, bytes.length, partialFixture(start)), bytes.length);
      requests++;
      return new Response(bytes, {
        status: 206,
        headers: { "Content-Range": `bytes ${start}-${end}/${index.source.size}` },
      });
    });
    const ranged = { ...index, map: rangeMap };
    const statuses: string[] = [];
    const rangedExamples = await loadClinvarExamples(ranged, undefined, (status) =>
      statuses.push(status),
    );
    assert.deepEqual(rangedExamples, examples);
    assert.equal(clinvarIndexPreview(ranged, rangedExamples), html);
    assert.ok(
      clinvarChapterHtml(ranged, {
        examples: rangedExamples,
        labels: {},
        meanings: {},
        reviewLabels: [],
      }).includes(html),
    );
    assert.deepEqual(statuses, ["Loading catalogue examples…"]);
    assert.ok(rangeMap.bytesRead > 0 && rangeMap.bytesRead < index.source.size / 100);
    assert.equal(rangeMap.rows.size, 3, "only the teaching examples are decoded into rows");
    assert.ok(
      [...map.keys()].every((key) => Array.isArray(rangeMap.get(key))),
      "matching locators remain intact",
    );
    const previousRequests = requests;
    assert.deepEqual(await loadClinvarExamples(ranged), examples);
    assert.equal(requests, previousRequests, "revisiting the chapter reuses cached rows");

    // If an entry is unavailable, the sample still fills three distinct rows.
    rangeMap.delete([...map.keys()][0]);
    const fallback = clinvarIndexPreview(ranged, await loadClinvarExamples(ranged));
    assert.equal((fallback.match(/<tr>/g) || []).length, 4);
    assert.equal(
      new Set([...fallback.matchAll(/<code>([^<]+)<\/code>/g)].map((m) => m[1])).size,
      3,
    );
  }
});

test("ClinVar example loading handles missing keys, cancellation and fetch failures", async () => {
  assert.deepEqual(await loadClinvarExamples({ build: "GRCh38", map: new Map() }), []);
  await assert.rejects(loadClinvarExamples(partialFixture({}), AbortSignal.abort()), {
    name: "AbortError",
  });
  const map = new Map([["1:9720793:G:A", []]]);
  Object.assign(map, {
    readEntries: async () => {
      throw new Error("Range request failed");
    },
  });
  await assert.rejects(
    loadClinvarExamples(partialFixture({ build: "GRCh38", map })),
    /Range request failed/,
  );
});
