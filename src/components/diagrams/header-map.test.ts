import test from "node:test";
import assert from "node:assert/strict";
import { headerMap, headerNote } from "./header-map.ts";

test("header topics precede their labelled excerpt without changing source text", () => {
  const html = headerMap({
    label: "A sample header",
    caption: "Real lines from the file.",
    groups: [
      {
        kind: "reference",
        left: headerNote("build", "Reference build", "Where coordinates come from."),
        right: headerNote("sequence", "Sequence names", "The original identifiers."),
        lines: [{ text: "##contig=<ID=chrUn_KI270442v1,length=392061>", number: 3 }],
      },
      {
        kind: "sample",
        lines: [{ text: "#CHROM\tPOS\tREF\tALT", number: 17, keyEnd: 6 }],
      },
    ],
  });

  const sourceLabel = html.indexOf("From your file");
  assert.ok(html.indexOf("Reference build") < sourceLabel);
  assert.ok(html.indexOf("Sequence names") < sourceLabel);
  assert.ok(sourceLabel < html.indexOf("##contig="));
  assert.match(html, /##contig=&lt;ID=chrUn_KI270442v1,length=392061&gt;/);
  assert.match(html, /aria-label="Header excerpt, line 17\. Scroll sideways for long lines\."/);
  assert.match(html, /tabindex="0" role="region"/);
  const columnLine = html.match(/<code><span class="header-map-key">([\s\S]*?)<\/code>/)![1]!;
  assert.equal(columnLine.replace("</span>", ""), "#CHROM\tPOS\tREF\tALT");
});
