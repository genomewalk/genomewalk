import test from "node:test";
import assert from "node:assert/strict";
import { populationPeople } from "./population-frequencies.ts";

test("zero and missing values stay unfilled while tiny observed frequencies remain visible", () => {
  const html = populationPeople(
    { a: 0, b: null, c: 0.000001 },
    { a: "Zero", b: "Missing", c: "Tiny" },
    { formatPercent: (value: number) => `${value * 100}%`, personPath: "" },
  );
  const people = [...html.matchAll(/<li class="frequency-people-group([^"]*)">([\s\S]*?)<\/li>/g)];
  assert.equal(people.length, 3);
  assert.ok(!people[0]![2]!.includes("frequency-person-fill"));
  assert.ok(!people[1]![2]!.includes("frequency-person-fill"));
  assert.match(people[0]![2]!, />0%<\/b>/);
  assert.match(people[1]![2]!, />No data<\/b>/);
  assert.match(people[2]![2]!, /height="3"/);
  assert.ok(!html.includes("NaN") && !html.includes("Infinity"));
});
