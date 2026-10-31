import type { ListOptions, IndexedSuggestion } from "./types.ts";
import { el, fmt, escape } from "../view/html.ts";
import { createResultIndex, filterResults, highlightMatch } from "./search.ts";
import { hydratePublicationLinks } from "./publication-links.ts";
import { resultFilterOptions } from "./filters.ts";

export function resultList<T>(
  hits: T[],
  {
    categories,
    categoriesOf,
    filtersOf,
    priorityOf,
    textOf,
    suggestionsOf,
    renderRow,
  }: ListOptions<T>,
) {
  const PAGE = 25,
    SUGGEST = 8;
  const box = el("div", "mlist");
  const { index, suggestions, counts } = createResultIndex(hits, {
    textOf,
    categoriesOf,
    suggestionsOf,
  });
  const filterValues = new Map(hits.map((hit) => [hit, filtersOf(hit)]));
  box.innerHTML = `
    <div class="ml-categories" role="group" aria-label="Filter results by evidence type">${categories
      .filter((c) => (c.id === "all" ? hits.length : counts.get(c.id) || 0) > 0)
      .map(
        (c) =>
          `<button type="button" data-category="${c.id}" aria-pressed="${c.id === "all"}">${c.label}<span>${fmt(c.id === "all" ? hits.length : counts.get(c.id) || 0)}</span></button>`,
      )
      .join("")}</div>
    <p class="ml-category-description">${categories[0]!.description}</p>
    <div class="ml-bar">
      <div class="ml-search">
        <span class="ml-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></span>
        <input class="ml-q" type="search" aria-label="Search results by gene, condition, rsID or position" placeholder="Search a gene, condition, rsID or position…" autocomplete="off" spellcheck="false">
        <div class="ml-sug" hidden></div>
      </div>
      <label class="ml-filter"><span>Classification</span><select class="ml-classification" aria-label="ClinVar classification"></select></label>
      <label class="ml-filter"><span>ClinVar stars</span><select class="ml-stars" aria-label="ClinVar stars"></select></label>
      <span class="ml-count"></span>
    </div>
    <p class="ml-review-note">Stars describe classification review, not disease severity. This order does not estimate your personal health risk.</p>
    <div class="ml-rows"></div>
    <div class="ml-pager"><button class="ml-prev">← Previous</button><span class="ml-page"></span><button class="ml-next">Next →</button></div>`;
  const q = box.querySelector<HTMLInputElement>(".ml-q")!,
    rows = box.querySelector<HTMLElement>(".ml-rows")!,
    count = box.querySelector<HTMLElement>(".ml-count")!,
    sug = box.querySelector<HTMLElement>(".ml-sug")!;
  const prev = box.querySelector<HTMLButtonElement>(".ml-prev")!,
    next = box.querySelector<HTMLButtonElement>(".ml-next")!,
    pageLbl = box.querySelector<HTMLElement>(".ml-page")!,
    classificationSelect = box.querySelector<HTMLSelectElement>(".ml-classification")!,
    starsSelect = box.querySelector<HTMLSelectElement>(".ml-stars")!;
  let page = 0,
    shown = index,
    picks: IndexedSuggestion[] = [],
    cursor = -1,
    category = "all",
    classification = "all",
    stars = "all";
  const render = () => {
    const pages = Math.max(1, Math.ceil(shown.length / PAGE));
    page = Math.min(page, pages - 1);
    rows.replaceChildren();
    let previousGroup = "";
    for (const { h } of shown.slice(page * PAGE, (page + 1) * PAGE)) {
      const group = priorityOf(h);
      if (group.id !== previousGroup) {
        const heading = el(
          "div",
          "ml-priority-heading",
          `<h3>${escape(group.label)}</h3><p>${escape(group.description)}</p>`,
        );
        heading.dataset["priority"] = group.id;
        rows.append(heading);
        previousGroup = group.id;
      }
      rows.append(renderRow(h));
    }
    void hydratePublicationLinks(rows);
    count.textContent =
      shown.length === hits.length
        ? `${fmt(hits.length)} results`
        : `${fmt(shown.length)} of ${fmt(hits.length)}`;
    pageLbl.textContent = `page ${page + 1} of ${pages}`;
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
    box.querySelector<HTMLElement>(".ml-pager")!.hidden = pages === 1;
    if (!shown.length)
      rows.append(
        el(
          "p",
          "s-why",
          "No results match these filters. Try another classification, star count, evidence category or search.",
        ),
      );
  };
  const filter = () => {
    const matches = filterResults(index, q.value, category);
    const matchesClass = ({ h }: (typeof index)[number]) =>
      classification === "all" || filterValues.get(h)!.classifications.includes(classification);
    const matchesStars = ({ h }: (typeof index)[number]) =>
      stars === "all" || filterValues.get(h)!.stars === stars;
    shown = matches.filter((row) => matchesClass(row) && matchesStars(row));
    // Search or category changes must not leave an invisible active filter.
    if (!shown.length && (classification !== "all" || stars !== "all")) {
      classification = stars = "all";
      shown = matches;
    }
    const classScope = matches.filter(matchesStars);
    const starScope = matches.filter(matchesClass);
    const classOptions = resultFilterOptions(classScope.map(({ h }) => filterValues.get(h)!));
    const starOptions = resultFilterOptions(starScope.map(({ h }) => filterValues.get(h)!));
    const setOptions = (
      select: HTMLSelectElement,
      options: typeof classOptions.classifications,
      selected: string,
      label: string,
      total: number,
    ) => {
      select.innerHTML =
        `<option value="all">${label} (${fmt(total)})</option>` +
        options
          .map(
            (option) =>
              `<option value="${escape(option.value)}">${escape(option.label)} (${fmt(option.count)})</option>`,
          )
          .join("");
      select.value = selected;
    };
    setOptions(
      classificationSelect,
      classOptions.classifications,
      classification,
      "All classifications",
      classScope.length,
    );
    setOptions(starsSelect, starOptions.stars, stars, "All stars", starScope.length);
    page = 0;
    render();
  };
  const suggest = () => {
    const needle = q.value.toLowerCase().trim();
    if (!needle) {
      sug.hidden = true;
      picks = [];
      cursor = -1;
      return;
    }
    const all = suggestions.filter((it) => it.l.includes(needle));
    picks = all.slice(0, SUGGEST);
    cursor = -1;
    if (!picks.length) {
      sug.hidden = true;
      return;
    }
    sug.innerHTML =
      `<div class="ml-sug-h">Showing ${picks.length} of ${fmt(all.length)}</div>` +
      picks
        .map(
          (it, i) =>
            `<div class="ml-sug-i" data-i="${i}"><span title="${escape(it.v)}">${highlightMatch(it.v, needle)}</span><span class="ml-sug-k">${it.kind}</span></div>`,
        )
        .join("");
    sug.hidden = false;
  };
  const pick = (i: number) => {
    if (!picks[i]) return;
    q.value = picks[i].v;
    sug.hidden = true;
    picks = [];
    filter();
  };
  const mark = () =>
    sug.querySelectorAll(".ml-sug-i").forEach((n, i) => n.classList.toggle("on", i === cursor));
  box.querySelector<HTMLElement>(".ml-categories")!.addEventListener("click", (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>("button[data-category]");
    if (!button) return;
    category = button.dataset["category"]!;
    box
      .querySelectorAll("[data-category]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    box.querySelector<HTMLElement>(".ml-category-description")!.textContent = categories.find(
      (c) => c.id === category,
    )!.description;
    sug.hidden = true;
    filter();
  });
  q.addEventListener("input", () => {
    filter();
    suggest();
  });
  classificationSelect.addEventListener("change", () => {
    classification = classificationSelect.value;
    sug.hidden = true;
    filter();
  });
  starsSelect.addEventListener("change", () => {
    stars = starsSelect.value;
    sug.hidden = true;
    filter();
  });
  q.addEventListener("keydown", (e: { key: string; preventDefault: () => void }) => {
    if (sug.hidden) return;
    if (e.key === "ArrowDown") {
      cursor = (cursor + 1) % picks.length;
      mark();
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      cursor = (cursor - 1 + picks.length) % picks.length;
      mark();
      e.preventDefault();
    } else if (e.key === "Enter" && cursor >= 0) {
      pick(cursor);
      e.preventDefault();
    } else if (e.key === "Escape") {
      sug.hidden = true;
    }
  });
  sug.addEventListener("mousedown", (e) => {
    const n = (e.target as Element).closest<HTMLElement>(".ml-sug-i");
    if (n) {
      pick(+n.dataset["i"]!);
      e.preventDefault();
    }
  });
  q.addEventListener("blur", () =>
    setTimeout(() => {
      sug.hidden = true;
    }, 120),
  );
  q.addEventListener("focus", suggest);
  prev.addEventListener("click", () => {
    page--;
    render();
    box.scrollIntoView({ block: "start", behavior: "smooth" });
  });
  next.addEventListener("click", () => {
    page++;
    render();
    box.scrollIntoView({ block: "start", behavior: "smooth" });
  });
  filter();
  return box;
}
