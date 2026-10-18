import { useEffect, type RefObject } from "react";

// Lesson HTML can arrive asynchronously or be restored from this visit's cache.
export function useScrollCues(outRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const out = outRef.current;
    if (!out) return;
    let pairs: { cue: HTMLElement; scrollers: HTMLElement[] }[] = [];
    const update = () => {
      for (const { cue, scrollers } of pairs)
        cue.toggleAttribute(
          "data-overflow",
          scrollers.some(
            (scroller) =>
              scroller.clientWidth > 0 && scroller.scrollWidth > scroller.clientWidth + 1,
          ),
        );
    };
    const resize = new ResizeObserver(update);
    const refresh = () => {
      resize.disconnect();
      pairs = Array.from(
        out.querySelectorAll<HTMLElement>(
          ".scroll-cue, .diagram-scroll-hint, .header-map-source-label small",
        ),
        (cue) => {
          const previous = cue.previousElementSibling;
          const scrollers = cue.matches(".header-map-source-label small")
            ? Array.from(cue.closest(".header-map-lines")!.querySelectorAll<HTMLElement>("pre"))
            : previous instanceof HTMLElement
              ? [previous]
              : [];
          for (const scroller of scrollers) {
            resize.observe(scroller);
            if (scroller.firstElementChild) resize.observe(scroller.firstElementChild);
          }
          return { cue, scrollers };
        },
      );
      update();
    };
    const mutation = new MutationObserver(refresh);
    mutation.observe(out, { childList: true, subtree: true, characterData: true });
    out.addEventListener("toggle", update, true);
    document.fonts.addEventListener("loadingdone", update);
    refresh();
    return () => {
      mutation.disconnect();
      resize.disconnect();
      out.removeEventListener("toggle", update, true);
      document.fonts.removeEventListener("loadingdone", update);
    };
  }, [outRef]);
}
