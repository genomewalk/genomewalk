import test from "node:test";
import assert from "node:assert/strict";
import { frequencySourceNote } from "./frequency-source.ts";

test("frequency notes distinguish missing assessment, measured disagreement and source filters", () => {
  assert.equal(frequencySourceNote({}), "");
  assert.doesNotMatch(
    frequencySourceNote({ gnomadFilter: "PASS", gnomadDiscordanceP: null }),
    /difference|caution/,
  );
  assert.doesNotMatch(frequencySourceNote({ gnomadDiscordanceP: 0.0001 }), /difference/);
  assert.match(frequencySourceNote({ gnomadDiscordanceP: 0 }), /substantial difference/);
  for (const filter of ["EXOMES_FILTERED", "GENOMES_FILTERED", "BOTH_FILTERED"])
    assert.match(frequencySourceNote({ gnomadFilter: filter }), /failing quality filters/);
});
