const escape = (value: string) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );

// Chart-only tones are defined in styles/charts.css, independently of text colors.
const tones = new Set([
  "green",
  "stone",
  "teal",
  "blue",
  "navy",
  "gold",
  "terracotta",
  "plum",
  "review-0",
  "review-1",
  "review-2",
  "review-3",
  "review-4",
]);

function sharePercent(fraction: number) {
  const percent = 100 * fraction;
  return (
    (percent === 0
      ? "0"
      : percent < 0.01
        ? "<0.01"
        : percent > 99.9 && percent < 100
          ? ">99.9"
          : Number(percent.toFixed(percent >= 10 ? 1 : 2)).toString()) + "%"
  );
}

// Reserve space only for tiny nonzero values, then share the remainder in
// proportion to the untouched counts. Data and labels are never rescaled.
export function visibleShares(counts: number[], minimum = 0.012) {
  const values = counts.map((n) => (Number.isFinite(n) && n > 0 ? n : 0));
  const total = values.reduce((sum, n) => sum + n, 0);
  if (!total) return values;
  const floor = Math.min(minimum, 1 / values.filter(Boolean).length);
  const fixed = new Set<number>();
  let remaining = 1;
  let weight = total;
  while (weight > 0) {
    const small = values.flatMap((n, i) =>
      n && !fixed.has(i) && (n / weight) * remaining < floor ? [i] : [],
    );
    if (!small.length) break;
    for (const i of small) {
      fixed.add(i);
      remaining -= floor;
      weight -= values[i]!;
    }
  }
  return values.map((n, i) => (!n ? 0 : fixed.has(i) ? floor : (n / weight) * remaining));
}

function legendLabel(label: string) {
  const text = String(label);
  const firstSpace = text.search(/\s/);
  const start = firstSpace < 0 ? text : text.slice(0, firstSpace);
  const rest = firstSpace < 0 ? "" : text.slice(firstSpace);
  return `<span class="share-chart-label"><span class="share-chart-label-start"><i aria-hidden="true"></i>${escape(start)}</span>${escape(rest)}</span>`;
}

export function splitBar(parts: { n: number; label: string; tone: string }[]) {
  const counts = parts.map(({ n }) => (Number.isFinite(n) && n > 0 ? n : 0));
  const total = counts.reduce((sum, n) => sum + n, 0);
  const shares = visibleShares(counts);
  const rows = parts.map((part, i) => ({
    ...part,
    n: counts[i],
    share: shares[i],
    percent: sharePercent(total ? counts[i]! / total : 0),
    enlarged: total > 0 && shares[i]! > counts[i]! / total + 1e-9,
    tone: tones.has(part.tone) ? part.tone : "navy",
  }));
  const count = (n: number) => n.toLocaleString("en-US");
  return `<figure class="share-chart" aria-label="Count breakdown">
    <div class="share-chart-track" aria-hidden="true">${rows
      .filter((p) => p.n)
      .map(
        (p) =>
          `<div class="share-chart-segment${p.enlarged ? " is-enlarged" : ""}" data-tone="${p.tone}" style="flex:${p.share}" title="${escape(`${p.label}: ${count(p.n!)} (${p.percent})${p.enlarged ? " — widened for visibility" : ""}`)}">${p.share! >= 0.13 ? `<span>${escape(p.percent)}</span>` : ""}</div>`,
      )
      .join("")}</div>
    <ul class="share-chart-legend">${rows
      .map(
        (p) =>
          `<li data-tone="${p.tone}"${p.enlarged ? ' class="is-enlarged"' : ""}>${legendLabel(p.label)}<div class="share-chart-value"><strong>${count(p.n!)}</strong><span>${escape(p.percent)}</span></div></li>`,
      )
      .join("")}</ul>
    ${!total ? "<figcaption>No records in these categories.</figcaption>" : rows.some((p) => p.enlarged) ? '<figcaption><span class="share-chart-key" aria-hidden="true"></span>Striped segments are widened for visibility. Counts and percentages show the actual shares.</figcaption>' : ""}
  </figure>`;
}
