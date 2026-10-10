import {
  CHROMOSOMES,
  FEATURED_PAIR,
  helixPose,
  helixPoint,
  sequenceHelixPoint,
  type GenomeZoom,
} from "./genome-model.ts";

// The same clickable HTML annotations work when WebGL is unavailable.
export function GenomeFallback({
  zoom,
  appearance,
}: {
  zoom: GenomeZoom;
  appearance: "paper" | "dark";
}) {
  const dark = appearance === "dark";
  return (
    <svg
      className="genome-zoom-fallback"
      viewBox="0 0 600 620"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {zoom === 0 &&
        CHROMOSOMES.map((item, index) => (
          <g key={index} opacity={index === FEATURED_PAIR ? 1 : dark ? 0.64 : 0.3}>
            {[0, 1].map((parent) => (
              <rect
                key={parent}
                x={item.x + (parent ? 4 : -15)}
                y={
                  item.y -
                  item.height / 2 +
                  (item.label === "XY" && parent === 1 ? item.height * 0.4 : 0)
                }
                width="11"
                height={item.height * (item.label === "XY" && parent === 1 ? 0.6 : 1)}
                rx="6"
                fill={
                  index === FEATURED_PAIR
                    ? parent
                      ? dark
                        ? "#78b9a1"
                        : "#327263"
                      : dark
                        ? "#dc9470"
                        : "#a35437"
                    : dark
                      ? "#b9cbb0"
                      : "#7d9281"
                }
              />
            ))}
          </g>
        ))}
      {zoom > 0 &&
        [0, 1].map((parent) => {
          const pose = helixPose(parent);
          const point = (t: number, side: number) =>
            zoom === 2 ? sequenceHelixPoint(t, side, parent) : helixPoint(t, side, pose);
          return (
            <g key={parent} opacity={zoom === 2 ? (dark ? 0.5 : 0.3) : 1}>
              {Array.from({ length: 31 }, (_, i) => {
                const a = point(i / 30, 0);
                const b = point(i / 30, 1);
                return (
                  <line
                    key={i}
                    x1={a.x.toFixed(3)}
                    y1={a.y.toFixed(3)}
                    x2={b.x.toFixed(3)}
                    y2={b.y.toFixed(3)}
                    stroke={i >= 11 && i <= 19 ? "#d9b779" : "#c9d6c6"}
                    strokeWidth={zoom === 2 ? 1.2 : 2}
                    strokeLinecap="round"
                  />
                );
              })}
              {[0, 1].map((side) => (
                <polyline
                  key={side}
                  points={Array.from({ length: 129 }, (_, i) => {
                    const p = point(i / 128, side);
                    return `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
                  }).join(" ")}
                  stroke={dark ? (parent ? "#92d7ba" : "#f0b08a") : parent ? "#4ea88f" : "#d68663"}
                  strokeWidth={zoom === 2 ? 3.2 : 6}
                  strokeLinecap="round"
                  fill="none"
                />
              ))}
            </g>
          );
        })}
    </svg>
  );
}
