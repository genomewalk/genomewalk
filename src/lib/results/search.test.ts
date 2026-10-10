import test from "node:test";
import assert from "node:assert/strict";
import { createResultIndex, filterResults, highlightMatch } from "./search.ts";

const hits = [
  { name: "GENE1 red green", categories: ["drug", "association"] },
  { name: "GENE2 red blue green", categories: ["disease"] },
  { name: "GENE3 green red", categories: ["drug"] },
];
const options: import("./types.ts").IndexOptions<(typeof hits)[number]> = {
  textOf: (hit) => hit.name,
  categoriesOf: (hit) => hit.categories,
  suggestionsOf: (hit) => [
    { v: "rs123", kind: "rsID" },
    { v: "rs123", kind: "condition" },
    { v: hit.name, kind: "gene" },
    { v: "", kind: "gene" },
  ],
};

test("result search prefers a full phrase and falls back to separate words within a category", () => {
  const { index } = createResultIndex(hits, options);
  assert.deepEqual(
    filterResults(index, " RED GREEN ").map(({ h }) => h),
    [hits[0]],
  );
  assert.deepEqual(
    filterResults(index, "red green", "disease").map(({ h }) => h),
    [hits[1]],
  );
  assert.deepEqual(
    filterResults(index, "green gene3", "drug").map(({ h }) => h),
    [hits[2]],
  );
  assert.deepEqual(
    filterResults(index, "", "drug").map(({ h }) => h),
    [hits[0], hits[2]],
  );
  assert.deepEqual(filterResults(index, "missing"), []);
  assert.equal(filterResults(index, "").length, 3);
});

test("overlapping categories count each variant once, and repeated suggestions remain distinct by kind", () => {
  let classified = 0;
  const { index, counts, suggestions } = createResultIndex(hits, {
    ...options,
    categoriesOf: (hit) => {
      classified++;
      return [...hit.categories, ...hit.categories];
    },
  });
  assert.equal(counts.get("drug"), 2);
  assert.equal(counts.get("association"), 1);
  assert.equal(counts.get("disease"), 1);
  assert.equal(suggestions.filter(({ v }) => v === "rs123").length, 2);
  assert.equal(suggestions.length, 5);
  filterResults(index, "gene");
  filterResults(index, "red", "drug");
  assert.equal(classified, 3, "typing reuses the index instead of recomputing categories");
});

test("search highlighting escapes file and catalogue text before adding markup", () => {
  assert.equal(
    highlightMatch('<gene a="G">&', "gene"),
    "&lt;<mark>gene</mark> a=&quot;G&quot;&gt;&amp;",
  );
  assert.equal(highlightMatch("<G>", "missing"), "&lt;G&gt;");
});
