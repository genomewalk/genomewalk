const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

const PEOPLE: Record<string, { name: string; icon: string }> = {
  eas: { name: "Mei", icon: "👩" },
  nfe: { name: "Tom", icon: "👨" },
};

function populationEntries(
  frequencies: Record<string, number | null | undefined>,
  populations: Record<string, string>,
) {
  return Object.entries(populations).map(([key, label]) => {
    const raw = frequencies[key];
    const value = Number.isFinite(raw) && raw! >= 0 && raw! <= 1 ? raw! : null;
    return { key, label, value };
  });
}

export function populationPeople(
  frequencies: Record<string, number | null | undefined>,
  populations: Record<string, string>,
  { formatPercent, personPath }: { formatPercent: (n: number) => string; personPath: string },
) {
  const entries = populationEntries(frequencies, populations);
  const figures = entries.map(({ key, label, value }, index) => {
    const person = PEOPLE[key];
    const frequency = value === null ? "No data" : formatPercent(value);
    // Match the original population figures: give tiny nonzero values a visible
    // minimum fill; zero and missing values remain unfilled.
    const height = value !== null && value > 0 ? Math.max(3, Number((40 * value).toFixed(3))) : 0;
    const clipId = `frequency-comparison-person-${index}`;
    const state = value === null ? " is-missing" : value === 0 ? " is-zero" : "";
    return `<li class="frequency-people-group${state}${person ? " is-highlighted" : ""}">
      <svg class="frequency-person" viewBox="0 0 24 40" width="30" height="50" aria-hidden="true">
        <defs><clipPath id="${clipId}"><path d="${personPath}"/></clipPath></defs>
        <path class="frequency-person-body" d="${personPath}"/>
        ${height > 0 ? `<rect class="frequency-person-fill" x="0" y="${40 - height}" width="24" height="${height}" clip-path="url(#${clipId})"/>` : ""}
      </svg>
      <b class="frequency-people-value">${frequency}</b>
      <span class="frequency-people-label">${escape(label.replaceAll("/", " / ").replace("non-Finnish", "non‑Finnish"))}${person ? ` <strong class="frequency-people-name"><span aria-hidden="true">${person.icon}</span> ${person.name}</strong>` : ""}</span>
    </li>`;
  });
  return `<figure class="frequency-people" aria-label="Frequency by ancestry group">
    <ul class="frequency-people-list">${figures.join("")}</ul>
    <figcaption>Small nonzero frequencies use a minimum fill.</figcaption>
  </figure>`;
}
