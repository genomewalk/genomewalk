import { fixture as partialFixture } from "../helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import {
  frequencyIndexPreview,
  clinvarIndexPreview,
} from "../../src/lib/catalogues/catalogue-preview.ts";
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

test("both builds render curated metadata examples identical to full catalogue rows without downloads", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Teaching examples must not download the catalogue");
  });
  for (const build of ["GRCh37", "GRCh38"]) {
    const metadata = JSON.parse(
      fs.readFileSync(
        new URL(`../../public/ref/${build}/catalog.meta.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(metadata.examples.length, 3);
    assert.equal("records" in metadata, false);
    assert.equal("blocks" in metadata, false);
    const expected = new Map<string, string>(
      metadata.examples.map((line: string) => [line.split("\t", 4).join(":"), line]),
    );
    const found = new Map<string, string>();
    const stream = fs.createReadStream(
      new URL(`../../public/ref/${build}/catalog.tsv.gz`, import.meta.url),
    );
    const decoded = stream.pipe(createGunzip());
    const lines = createInterface({ input: decoded, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        const key = line.split("\t", 4).join(":");
        if (expected.has(key)) found.set(key, line);
        if (found.size === expected.size) break;
      }
    } finally {
      lines.close();
      decoded.destroy();
      stream.destroy();
    }
    assert.equal(found.size, expected.size);
    for (const [key, line] of expected) assert.equal(found.get(key), line);
    const html = clinvarIndexPreview(metadata, metadata.examples);
    for (const gene of ["PIK3CD", "SAMD11", "CYP2C19"])
      assert.ok(html.includes(`<td>${gene}</td>`));
    for (const key of expected.keys()) assert.ok(html.includes(key));
    for (const stars of [1, 3, 4]) assert.ok(html.includes(`${stars} / 4 stars`));
    assert.match(html, /<td>Pathogenic<\/td>/);
    assert.match(html, /<td>Conflicting classifications of pathogenicity<\/td>/);
    assert.match(html, /<td>drug response<\/td>/);
    assert.match(html, /Clopidogrel response; CYP2C19: increased function/);
    assert.equal((html.match(/<tr>/g) || []).length, 4);
    assert.ok(
      clinvarChapterHtml(metadata, {
        examples: metadata.examples,
        labels: {},
        meanings: {},
        reviewLabels: [],
      }).includes(html),
    );
    const fallback = clinvarIndexPreview(metadata, metadata.examples.slice(1));
    assert.equal((fallback.match(/<tr>/g) || []).length, 4);
    assert.equal(
      new Set([...fallback.matchAll(/<code>([^<]+)<\/code>/g)].map((match) => match[1])).size,
      3,
    );
  }
});
