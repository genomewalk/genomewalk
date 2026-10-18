import test from "node:test";
import assert from "node:assert/strict";
import { fileFields } from "./file-excerpt.ts";

test("labelled file fields preserve long values and escape file-supplied markup", () => {
  const value = "0/1:38:99:19,19:255,0,255";
  const html = fileFields(
    [
      { labelHtml: '<a class="cell-k" href="#alt">ALT</a>', value: "<DEL>" },
      { labelHtml: '<a class="cell-k" href="#you">YOU</a>', value },
    ],
    'Example "line"',
  );
  assert.ok(html.includes(value));
  assert.ok(html.includes("&lt;DEL&gt;"));
  assert.ok(html.includes('aria-label="Example &quot;line&quot;"'));
  assert.ok(html.indexOf('href="#alt"') < html.indexOf('href="#you"'));
  assert.doesNotMatch(html, /<DEL>/);
});
