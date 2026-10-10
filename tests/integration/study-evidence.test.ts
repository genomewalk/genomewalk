import type { Marker, MarkerData } from "../../src/lib/catalogues/types.ts";
import { fixture as partialFixture } from "../helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as renderer from "../../src/experiences/vcf/engine/view/markers.ts";
import {
  hasStudyEvidence,
  studyCitations,
} from "../../src/experiences/vcf/engine/study-evidence.ts";
import { testDocument } from "../helpers/vcf.ts";

globalThis.document = testDocument();
const readJson = (file: string | URL) =>
  JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
const base: Marker[] = readJson("../../scripts/markers.base.json");

test("missing, empty and malformed sources hide the whole interpretation and narrative", () => {
  const valid = base.find((marker: { rs: string }) => marker.rs === "rs671");
  for (const cite of [
    undefined,
    null,
    [],
    {},
    { label: "", url: "https://example.org" },
    { label: "Study", url: "not-a-url" },
    { label: "Study", url: "javascript:alert(1)" },
    { label: "Study", url: "http://example.org" },
    [valid!.cite, { label: "Missing URL" }],
  ]) {
    const marker = { ...valid, cite };
    assert.equal(hasStudyEvidence(partialFixture(marker)), false);
    assert.equal(renderer.markerRow(partialFixture(marker), partialFixture({})), null);
    assert.equal(renderer.featuredMarkers(partialFixture({ markers: [marker] })).length, 0);
    assert.equal(renderer.storyBlock(partialFixture({ markers: [marker] })), "");
  }
});

test("every shipped interpretation has the same cited wording as the curated source", () => {
  const approved = base.filter(hasStudyEvidence);
  assert.equal(approved.length, 5);
  for (const build of ["GRCh37", "GRCh38"]) {
    const data: MarkerData = readJson(`../../public/ref/${build}/markers.json`);
    assert.deepEqual(data.markers.map((m) => m.rs).sort(), approved.map((m) => m.rs).sort());
    for (const marker of data.markers) {
      const original = approved.find((m) => m.rs === marker.rs);
      assert.equal(hasStudyEvidence(marker), true);
      assert.deepEqual(marker.cite, original!.cite);
      assert.deepEqual(marker.read, original!.read);
      assert.equal(marker.studyNote, original!.studyNote);
    }
  }
});

test("catalogue frequency examples include every research source on both builds", () => {
  for (const build of ["GRCh37", "GRCh38"]) {
    const data = readJson(`../../public/ref/${build}/markers.json`);
    for (const marker of data.markers) {
      const html = renderer.markerRow(marker, data)!.innerHTML;
      for (const cite of studyCitations(marker)) {
        assert.ok(
          html.includes(`href="${cite.url}" target="_blank" rel="noopener"`),
          `${build} ${marker.rs}: missing link`,
        );
        assert.ok(html.includes(cite.label), `${build} ${marker.rs}: missing study name`);
      }
      assert.ok(!html.includes("from published studies of this gene, not gnomAD"));
      assert.ok(html.includes(marker.studyNote));
      assert.ok(!marker.read.some((reading: string) => html.includes(reading)));
    }
  }
});
