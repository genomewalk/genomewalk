import { fixture as partialFixture } from "../../../tests/helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { storyBlock as vcfStory } from "../../experiences/vcf/engine/view/markers.ts";
const consumerModule = new URL(
  "../../experiences/consumer-dna/engine/view/population.ts",
  import.meta.url,
);
const consumerStory = fs.existsSync(consumerModule)
  ? (await import(consumerModule.href)).storyBlock
  : null;

const reference = (build: string | undefined) =>
  JSON.parse(
    partialFixture(
      fs.readFileSync(new URL(`../../../public/ref/${build}/markers.json`, import.meta.url)),
    ),
  );

test("available formats use the loaded build's frequencies in the same comparison", () => {
  for (const [build, eastAsian] of [
    ["GRCh37", "27%"],
    ["GRCh38", "22%"],
  ]) {
    const data = reference(build);
    const html = vcfStory(data);
    if (consumerStory) assert.equal(html, consumerStory(data));
    const people = [...html.matchAll(/<li class="frequency-people-group[^"]*">([\s\S]*?)<\/li>/g)];
    const mei = people.find((person) => person[1]!.includes(" Mei</strong>"));
    assert.ok(mei![1]!.includes(`>${eastAsian}</b>`));
    assert.ok(!html.includes("Does it do anything?"));
  }
});

test("missing population counts stay distinct from zero", () => {
  const data = reference("GRCh38");
  const marker = data.markers.find(({ rs }: { rs: string }) => rs === "rs671");
  marker.pops = { eas: 0, nfe: null, sas: 0.3 };
  const html = vcfStory(data);
  const people = [...html.matchAll(/<li class="frequency-people-group([^"]*)">([\s\S]*?)<\/li>/g)];
  const mei = people.find((person) => person[2]!.includes(" Mei</strong>"));
  const tom = people.find((person) => person[2]!.includes(" Tom</strong>"));
  assert.match(mei![1]!, /is-zero/);
  assert.match(mei![2]!, />0%<\/b>/);
  assert.match(tom![1]!, /is-missing/);
  assert.match(tom![2]!, />No data<\/b>/);
  assert.ok(html.includes("No frequency is reported for this group."));
});

test("stacked comparison answers identify each person and keep shared answers once", () => {
  const html = vcfStory(reference("GRCh38"));
  assert.match(
    html,
    /<span class="frequency-comparison-person"><b>Mei<\/b> · East Asian ancestry<\/span><b>Less surprising\.<\/b>/,
  );
  assert.match(
    html,
    /<span class="frequency-comparison-person"><b>Tom<\/b> · European ancestry<\/span><b>More surprising\.<\/b>/,
  );
  assert.equal((html.match(/<figure class="frequency-people"/g) || []).length, 1);
  assert.equal(
    (html.match(/Frequency alone cannot tell us\. Check the quality of the call\./g) || []).length,
    1,
  );
  assert.equal(
    (html.match(/Frequency alone does not calculate either person’s risk\./g) || []).length,
    1,
  );
});
