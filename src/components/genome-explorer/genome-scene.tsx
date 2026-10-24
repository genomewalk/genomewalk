import { useEffect, useRef, useState } from "react";
import type { GenomeZoom } from "./genome-model.ts";
import { GenomeFallback } from "./genome-fallback.tsx";
import { AppError } from "../../lib/app-error.ts";
import { reportError } from "../../lib/error-reporting.ts";

/** One continuous scene: the camera approaches a pair as its DNA unpacks. */
export function GenomeScene({
  zoom,
  appearance = "paper",
}: {
  zoom: GenomeZoom;
  appearance?: "paper" | "dark";
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<number>(zoom);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    targetRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let dispose = () => {};

    void import("./graphics/genome-scene.ts")
      .then(({ createGenomeScene }) => {
        if (cancelled) return;
        const cleanup = createGenomeScene(host, targetRef, appearance);
        if (cleanup) {
          dispose = cleanup;
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) reportError(new AppError("GRAPHICS_UNAVAILABLE"), "illustration");
      });
    return () => {
      cancelled = true;
      dispose();
    };
  }, [appearance]);

  return (
    <>
      <div className="genome-zoom-canvas" ref={hostRef} aria-hidden="true" />
      {!ready && <GenomeFallback zoom={zoom} appearance={appearance} />}
    </>
  );
}
