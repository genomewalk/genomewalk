import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, type MouseEvent, type RefObject } from "react";

// Teaching output is generated HTML. Keep its chapter links inside the router
// so following a refresher preserves the loaded file and completed chapters.
export function useLessonNavigation(outRef: RefObject<HTMLDivElement | null>, running: boolean) {
  const navigate = useNavigate();
  const hash = useLocation({ select: (location) => location.hash });

  useEffect(() => {
    if (running || !hash) return;
    const target = document.getElementById(hash);
    if (!target || !outRef.current?.contains(target)) return;
    const details = target.closest("details");
    if (details) details.open = true;
    target.scrollIntoView({ block: "start" });
  }, [hash, running, outRef]);

  return (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>("a");
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    // Open a collapsed explanation before the browser follows its fragment.
    // This also works when the user closes it and follows the same link again.
    if (anchor.getAttribute("href")?.startsWith("#")) {
      const target = document.getElementById(anchor.hash.slice(1));
      if (target && outRef.current?.contains(target)) {
        const details = target.closest("details");
        if (details) details.open = true;
      }
      return;
    }
    const chapter = anchor.dataset["chapterLink"];
    if (!chapter || !/^\d+$/.test(chapter)) return;
    event.preventDefault();
    void navigate({ to: "/chapter/$n", params: { n: chapter }, hash: anchor.hash.slice(1) });
  };
}
