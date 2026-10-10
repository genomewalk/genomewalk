import { useEffect, useRef, useState } from "react";

/** Original decorative DNA sculpture. No specimen data enters this component. */
export function LandingMolecule({ animated = true }: { animated?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let dispose = () => {};

    void import("./graphics/landing-molecule.ts")
      .then(({ createLandingMolecule }) => {
        if (cancelled) return;
        const cleanup = createLandingMolecule(host, animated);
        if (cleanup) {
          dispose = cleanup;
          setReady(true);
        }
      })
      .catch(() => {
        /* Keep the static illustration if WebGL is unavailable. */
      });
    return () => {
      cancelled = true;
      dispose();
    };
  }, [animated]);

  const trace = (phase: number) =>
    Array.from({ length: 161 }, (_, i) => {
      const t = i / 160;
      return `${i ? "L" : "M"}${(240 + Math.sin(t * Math.PI * 5.4 + phase) * 75).toFixed(3)},${(20 + t * 660).toFixed(3)}`;
    }).join(" ");
  return (
    <div className={`landing-molecule${ready ? " is-ready" : ""}`} aria-hidden="true">
      <svg className="landing-molecule-fallback" viewBox="0 0 480 700" fill="none">
        <g transform="rotate(20 240 350)">
          {Array.from({ length: 40 }, (_, i) => (
            <path
              key={i}
              d={`M${(240 + Math.sin((i / 39) * Math.PI * 5.4) * 75).toFixed(3)},${(20 + (i / 39) * 660).toFixed(3)}h${(-Math.sin((i / 39) * Math.PI * 5.4) * 150).toFixed(3)}`}
              stroke="#c4cbb0"
              strokeWidth="2"
              opacity=".65"
            />
          ))}
          <path d={trace(0)} stroke="#eab494" strokeWidth="9" strokeLinecap="round" />
          <path d={trace(Math.PI)} stroke="#85bba9" strokeWidth="9" strokeLinecap="round" />
        </g>
      </svg>
      <div className="landing-molecule-canvas" ref={hostRef} />
    </div>
  );
}
