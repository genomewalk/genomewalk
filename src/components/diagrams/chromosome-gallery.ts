const CHROMOSOMES = Array.from({ length: 22 }, (_, i) => String(i + 1)).concat(["X", "Y", "MT"]);
let galleryId = 0;

const escape = (value: string) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );

function chromosomeIllustration(id: string, mitochondrial: boolean) {
  const shape = mitochondrial
    ? '<circle cx="30" cy="30" r="23" fill="none" stroke="white" stroke-width="9"/>'
    : `<g fill="none" stroke="white" stroke-width="15" stroke-linecap="round">
        <path d="M16 10 C29 39 29 69 16 98"/>
        <path d="M44 10 C31 39 31 69 44 98"/>
      </g>`;
  return `<svg class="chromosome-gallery-shape${mitochondrial ? " is-mitochondrial" : ""}"
    viewBox="0 0 60 ${mitochondrial ? 60 : 108}" aria-hidden="true" focusable="false">
    <defs>
      <mask id="${id}-shape">${shape}</mask>
      <linearGradient id="${id}-light">
        <stop offset="0" stop-color="white" stop-opacity=".12"/>
        <stop offset=".3" stop-color="white" stop-opacity=".38"/>
        <stop offset=".6" stop-color="white" stop-opacity="0"/>
        <stop offset="1" stop-color="black" stop-opacity=".15"/>
      </linearGradient>
      <pattern id="${id}-bands" width="60" height="3.6" patternUnits="userSpaceOnUse">
        <path d="M0 .7 H60" stroke="white" stroke-opacity=".4" stroke-width=".9"/>
        <path d="M0 2.8 H60" stroke="black" stroke-opacity=".12" stroke-width=".6"/>
      </pattern>
    </defs>
    <g mask="url(#${id}-shape)">
      <path d="M0 0 H60 V108 H0Z" fill="currentColor"/>
      <path d="M0 0 H60 V108 H0Z" fill="url(#${id}-light)"/>
      <path d="M0 0 H60 V108 H0Z" fill="url(#${id}-bands)"/>
    </g>
  </svg>`;
}

// Both chapter-four views use the same presentation, with their own count unit.
// These are count-scaled symbols, not cytogenetic ideograms or physical lengths.
export function chromosomeGallery(chrom: Record<string, number>, { unit = "rows" } = {}) {
  const prefix = `chromosome-gallery-${++galleryId}`;
  const counts = new Map<string, number>();
  for (const [raw, count] of Object.entries(chrom)) {
    const name = raw.replace(/^chr/i, "").replace(/^M$/i, "MT");
    counts.set(name, (counts.get(name) || 0) + count);
  }
  const names = CHROMOSOMES.concat(
    [...counts.keys()].filter((name) => !CHROMOSOMES.includes(name)),
  );
  const max = Math.max(1, ...counts.values());
  return `<figure class="chromosome-gallery" aria-label="${escape(unit)} per chromosome">
    <ul class="chromosome-gallery-grid">
      ${names
        .map((name, i) => {
          const count = counts.get(name) || 0;
          const formatted = count.toLocaleString("en-US");
          // A small floor keeps sparse chromosomes legible; zero stays visibly zero.
          const scale = count ? Math.max(0.18, count / max).toFixed(4) : "0";
          return `<li class="chromosome-gallery-item${count ? "" : " is-empty"}"
          style="--chromosome-scale:${scale}" aria-label="${escape(name === "MT" ? "Mitochondrial DNA" : `Chromosome ${name}`)}: ${formatted} ${escape(unit)}">
          <div class="chromosome-gallery-stage" aria-hidden="true">
            ${count ? chromosomeIllustration(`${prefix}-${i}`, name === "MT") : '<span class="chromosome-gallery-empty">—</span>'}
          </div>
          <span class="chromosome-gallery-label">${escape(name)}</span>
          <span class="chromosome-gallery-count">${formatted}</span>
        </li>`;
        })
        .join("")}
    </ul>
    <figcaption>Illustration height follows row count, with a minimum height for small counts. Numbers show exact totals.</figcaption>
  </figure>`;
}
