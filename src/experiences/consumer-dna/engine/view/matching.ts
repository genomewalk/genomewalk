import type { LookupIssue } from "../../types.ts";
import { el, escape, fmt, kvx, rawBlock } from "./html.ts";

// Keep unresolved identities separate from interpreted alleles. Render in small
// batches so a file with many disagreements does not create a huge DOM at once.
export function matchingIssues(issues: LookupIssue[], columns: string[]) {
  const count = issues.length;
  const panel = kvx(
    "Needs review",
    `${fmt(count)} ${count === 1 ? "record" : "records"}`,
    `<p>For these records, the rsID points to a different location in this reference release
      than the position written in your file. We cannot tell which is correct, so these
      records are excluded from matching. They are not additional health findings.</p>
     <p class="mini">Coordinates below use the same reference build. No position is moved or guessed.</p>`,
  );
  const body = panel.querySelector(".kvx-body");
  const more = el("button", "btn", "Show more records");
  more.type = "button";
  let shown = 0;
  function appendBatch() {
    for (const issue of issues.slice(shown, shown + 20)) {
      const { call, build, resolvedRsid, referencePositions } = issue;
      body!.append(
        kvx(
          escape(call.id),
          "Position disagreement",
          `<p><b>In your file:</b> ${escape(build)} · ${escape(call.chrom)}:${escape(call.pos)}<br>
           <b>In this reference:</b> ${escape(build)} · ${referencePositions.map(escape).join(", ")}</p>
           ${resolvedRsid !== call.id ? `<p class="mini">Checked identifier: ${escape(resolvedRsid)}.</p>` : ""}
           ${rawBlock([columns.join("\t"), call.fields.join("\t")])}`,
        ),
      );
    }
    shown += 20;
    if (shown < count) body!.append(more);
    else more.remove();
  }
  more.addEventListener("click", appendBatch);
  appendBatch();
  return panel;
}
