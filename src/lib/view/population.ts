export const PERSON_PATH =
  "M12 1a5 5 0 1 1 0 10a5 5 0 1 1 0-10zM7 13h10a3 3 0 0 1 3 3v10h-3v13h-4.5V27h-1V39H7V26H4V16a3 3 0 0 1 3-3z";

export function personFigure(frac: number, title: string) {
  // Tiny nonzero frequencies remain visible; zero stays empty.
  const h = frac > 0 ? Math.max(3, +(40 * Math.min(1, frac)).toFixed(1)) : 0;
  return `<svg class="person" viewBox="0 0 24 40" width="18" height="30" aria-label="${title}"><title>${title}</title>
    <path class="body" d="${PERSON_PATH}"/>
    <rect class="fill" x="0" y="${40 - h}" width="24" height="${h}" clip-path="url(#wgs-person)"/></svg>`;
}

export const personDefs = () =>
  `<svg width="0" height="0" style="position:absolute"><defs><clipPath id="wgs-person"><path d="${PERSON_PATH}"/></clipPath></defs></svg>`;

export function tallyFigure() {
  const A = [1, 0, 2, 0, 0],
    B = [0, 0, 0, 0, 0]; // copies carrying the change, per person
  const person = (c: number) =>
    personFigure(
      c / 2,
      c === 0
        ? "both copies match the reference"
        : c === 1
          ? "one copy carries the change"
          : "both copies carry the change",
    );
  const row = (
    lbl: string,
    people: number[],
    n: number,
    total: number,
    cls?: string,
  ) => `<div class="tally-row${cls ? " " + cls : ""}">
    <span class="tally-lbl">${lbl}</span>
    <span class="tally-people">${people.map(person).join("")}</span>
    <span class="tally-n"><b>${n}</b> of ${total} copies → <b>${Math.round((100 * n) / total)}%</b></span></div>`;
  return `<div class="tally">
    ${personDefs()}
    ${row("everyone", [...A, ...B], 3, 20)}
    ${row("East Asian", A, 3, 10, "sub")}
    ${row("European", B, 0, 10, "sub")}
    <span class="tally-cap">each figure is one person with two copies: ${personFigure(0, "none")} neither carries the change,
      ${personFigure(0.5, "half")} one does, ${personFigure(1, "both")} both do</span>
  </div>`;
}

export const pct = (x: number) =>
  x === 0
    ? "0%"
    : x < 0.0001
      ? "&lt;0.01%"
      : (x >= 0.1
          ? (100 * x).toFixed(0)
          : x >= 0.01
            ? (100 * x).toFixed(1)
            : (100 * x).toFixed(2)) + "%";
