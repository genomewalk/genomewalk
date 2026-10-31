import type { ListOptions, IndexedSuggestion } from "./types.ts";
import { el, fmt, escape } from "../view/html.ts";
import { createResultIndex, filterResults, highlightMatch } from "./search.ts";
import { hydratePublicationLinks } from "./publication-links.ts";

export function resultList<T>(
  hits: T[],
  {
    categories,
    categoriesOf,
    priorities,
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
  box.innerHTML = `
    <div class="ml-categories" role="group" aria-label="Filter results by evidence type">${categories
      .filter((c) => (c.id === "all" ? hits.length : counts.get(c.id) || 0) > 0)
      .map(
        (c) =>
          `<button type="button" data-category="${c.id}" aria-pressed="${c.id === "all"}">${c.label}<span>${fmt(c.id === "all" ? hits.length : counts.get(c.id) || 0)}</span></button>`,
      )
      .join("")}</div>
    <p class="ml-category-description">${categories[0]!.description}</p>
    <div class="ml-priority">
      <h3 class="ml-priority-title">Priority for review</h3>
      <div class="ml-categories ml-priority-options" role="group" aria-label="Priority for review">
        <button type="button" data-review-group="all" aria-pressed="true">All groups<span></span></button>${priorities
          .map(
            (group) =>
              `<button type="button" data-review-group="${group.id}" aria-pressed="false">${escape(group.label)}<span></span></button>`,
          )
          .join("")}
      </div>
      <p>Ordered by ClinVar classification and review. Stars describe review, not disease severity. This order does not estimate your personal health risk.</p>
    </div>
    <div class="ml-bar">
      <span class="ml-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></span>
      <input class="ml-q" type="search" aria-label="Search results by gene, condition, rsID or position" placeholder="Search a gene, condition, rsID or position…" autocomplete="off" spellcheck="false">
      <span class="ml-count"></span>
      <div class="ml-sug" hidden></div>
    </div>
    <div class="ml-rows"></div>
    <div class="ml-pager"><button class="ml-prev">← Previous</button><span class="ml-page"></span><button class="ml-next">Next →</button></div>`;
  const q = box.querySelector<HTMLInputElement>(".ml-q")!,
    rows = box.querySelector<HTMLElement>(".ml-rows")!,
    count = box.querySelector<HTMLElement>(".ml-count")!,
    sug = box.querySelector<HTMLElement>(".ml-sug")!;
  const prev = box.querySelector<HTMLButtonElement>(".ml-prev")!,
    next = box.querySelector<HTMLButtonElement>(".ml-next")!,
    pageLbl = box.querySelector<HTMLElement>(".ml-page")!,
    priorityOptions = box.querySelector<HTMLElement>(".ml-priority-options")!;
  let page = 0,
    shown = index,
    picks: IndexedSuggestion[] = [],
    cursor = -1,
    category = "all",
    priority = "all";
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
          "No results match these filters. Try another review group, evidence category or search.",
        ),
      );
  };
  const filter = () => {
    const matches = filterResults(index, q.value, category);
    const groupCounts = new Map<string, number>();
    for (const { h } of matches) {
      const id = priorityOf(h).id;
      groupCounts.set(id, (groupCounts.get(id) || 0) + 1);
    }
    // Changing evidence category or search must not leave an invisible active filter.
    if (priority !== "all" && !groupCounts.get(priority)) priority = "all";
    for (const button of priorityOptions.querySelectorAll<HTMLButtonElement>("button")) {
      const id = button.dataset["reviewGroup"]!;
      const total = id === "all" ? matches.length : groupCounts.get(id) || 0;
      button.hidden = total === 0;
      button.setAttribute("aria-pressed", String(id === priority));
      button.querySelector("span")!.textContent = fmt(total);
    }
    shown = matches.filter(({ h }) => priority === "all" || priorityOf(h).id === priority);
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
  priorityOptions.addEventListener("click", (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>("button[data-review-group]");
    if (!button) return;
    priority = button.dataset["reviewGroup"]!;
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
