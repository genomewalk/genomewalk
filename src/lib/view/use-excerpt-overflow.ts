import { useEffect, type RefObject } from "react";

const SCROLL_CONTAINERS = [
  ".header-map-scroll", ".row-map-layout", ".table-scroll",
  ".catalogue-preview-scroll", ".frequency-comparison-body", ".diagram-scroll",
].join(",");

// Generated lesson content can arrive or be restored after mount. Only suppress
// an excerpt's own scroll area when an enclosing table/diagram actually scrolls.
export function useExcerptOverflow(outRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const out = outRef.current;
    if (!out) return;
    const clipped = new Map<HTMLElement, string | null>();
    const observed = new Set<Element>();
    let frame = 0;
    const restore = (excerpt: HTMLElement, tabIndex: string | null) => {
      excerpt.removeAttribute("data-scroll-ellipsis");
      if (tabIndex === null) excerpt.removeAttribute("tabindex");
      else excerpt.setAttribute("tabindex", tabIndex);
      clipped.delete(excerpt);
    };
    const update = () => {
      frame = 0;
      const containers = [...out.querySelectorAll<HTMLElement>(SCROLL_CONTAINERS)];
      const overflowing = containers.filter(
        (element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1,
      );
      const excerpts = new Set(
        overflowing.flatMap((element) => [...element.querySelectorAll<HTMLElement>("pre")]),
      );
      for (const [excerpt, tabIndex] of clipped) {
        if (!excerpts.has(excerpt)) restore(excerpt, tabIndex);
      }
      for (const excerpt of excerpts) {
        if (clipped.has(excerpt)) continue;
        clipped.set(excerpt, excerpt.getAttribute("tabindex"));
        excerpt.setAttribute("data-scroll-ellipsis", "");
        excerpt.removeAttribute("tabindex");
        excerpt.scrollLeft = 0;
      }
      // Observe the contents too: fonts and expanded details can change their
      // size without changing the enclosing container's width.
      const targets = new Set<Element>([out, ...containers]);
      for (const container of containers) {
        if (container.firstElementChild) targets.add(container.firstElementChild);
      }
      for (const element of observed) {
        if (!targets.has(element)) {
          resize.unobserve(element);
          observed.delete(element);
        }
      }
      for (const element of targets) {
        if (!observed.has(element)) {
          resize.observe(element);
          observed.add(element);
        }
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    mutations.observe(out, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["open"],
    });
    update();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      for (const [excerpt, tabIndex] of clipped) restore(excerpt, tabIndex);
    };
  }, [outRef]);
}
