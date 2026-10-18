export interface HeaderNote {
  links: string;
  text: string;
}
export interface HeaderGroup {
  kind: string;
  left?: HeaderNote | null;
  right?: HeaderNote | null;
  lines: { text: string; number: number; keyEnd?: number }[];
}
const escape = (value: unknown) =>
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

export const headerNote = (id: string, title: string, text: string) => ({
  links: `<a href="#${escape(id)}">${escape(title)} <span aria-hidden="true">↘</span></a>`,
  text,
});

// Both file formats use the same sheet, line labels and margin annotations.
// Callers choose real excerpts and supply format-specific explanations.
export function headerMap({
  groups,
  label,
  caption,
}: {
  groups: HeaderGroup[];
  label: string;
  caption: string;
}) {
  const annotation = (content: HeaderNote | undefined | null, side: string) =>
    content
      ? `<div class="header-map-note header-map-note-${side}"><div class="header-map-links">${content.links}</div><p>${content.text}</p></div>`
      : "";

  return `<figure class="header-map" aria-label="${escape(label)}">
    <figcaption><strong>Your header, at a glance</strong><span>Selected lines from your file, grouped by topic. Follow a topic link for more detail.</span></figcaption>
    <div class="header-map-sheet">
      <div class="header-map-heading"><span>Reading the header</span><span>From the file</span></div>
      ${groups
        .filter(({ lines }) => lines.length)
        .map(
          ({
            kind,
            left,
            right,
            lines,
          }) => `<div class="header-map-group header-map-${escape(kind)}${left && right ? " has-both-notes" : ""}">
        ${annotation(left, "left")}
        ${annotation(right, "right")}
        <div class="header-map-lines"><p class="header-map-source-label"><span>From your file</span> <small>Scroll sideways for long lines.</small></p>${lines
          .map(
            ({ text, number, keyEnd = 0 }) =>
              `<div class="header-map-line${text.includes("\t") ? " header-map-line-tabular" : ""}"><span class="header-map-number" aria-label="Line ${number}" title="Line ${number}">L${number}</span><pre tabindex="0" role="region" aria-label="Header excerpt, line ${number}"><code>${keyEnd ? `<span class="header-map-key">${escape(text.slice(0, keyEnd))}</span>` : ""}${escape(text.slice(keyEnd))}</code></pre></div>`,
          )
          .join("")}</div>
      </div>`,
        )
        .join("")}
    </div>
    <p class="header-map-caption">${caption}</p>
  </figure>`;
}
