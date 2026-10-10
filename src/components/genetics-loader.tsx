import type { CSSProperties } from "react";

type GeneticsLoaderProps = {
  label?: string;
  progress?: number | undefined;
  compact?: boolean;
};

export function GeneticsLoader({
  label = "Reading your genome…",
  progress,
  compact = false,
}: GeneticsLoaderProps) {
  const percent =
    progress == null ? undefined : Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <div
      className={`genetics-loader${compact ? " genetics-loader--compact" : ""}`}
      role={percent == null ? "status" : "progressbar"}
      aria-label={percent == null ? undefined : label}
      aria-valuenow={percent}
      aria-valuemin={percent == null ? undefined : 0}
      aria-valuemax={percent == null ? undefined : 100}
    >
      <span className="genetics-mark" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => {
          const offset = Math.cos((index * Math.PI) / 4) * 11;
          return (
            <span
              key={index}
              className="genetics-rung"
              style={
                {
                  "--rung": index,
                  "--rest-offset": `${offset}px`,
                  "--rest-scale": Math.max(0.08, Math.abs(offset) / 11),
                } as CSSProperties
              }
            >
              <i className="genetics-bond" />
              <i className="genetics-bead genetics-bead--coral" />
              <i className="genetics-bead genetics-bead--jade" />
            </span>
          );
        })}
      </span>
      <span className="genetics-loader-copy">
        <span className="genetics-loader-label">{label}</span>
        {percent != null && (
          <span
            className="genetics-loader-percent"
            style={{ "--progress": `${percent}%` } as CSSProperties}
          >
            {percent}%
          </span>
        )}
      </span>
    </div>
  );
}
