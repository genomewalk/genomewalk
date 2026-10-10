import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { ArrowUpLeft, ZoomIn } from "lucide-react";
import { GenomeScene } from "./genome-scene.tsx";
import {
  CHROMOSOMES,
  FEATURED_PAIR,
  helixPose,
  helixPoint,
  helixFrameTransform,
  helixConnector,
  MATERNAL_SEQUENCE,
  PATERNAL_SEQUENCE,
  VARIANT_INDEX,
  SEQUENCE_START,
  SEQUENCE_Y,
  SEQUENCE_END,
  SEQUENCE_STEP,
  SEQUENCE_VARIANT_X,
  type GenomeZoom,
} from "./genome-model.ts";
import styles from "./genome-explorer.module.css";

const descriptions = [
  "A typical body cell has 23 chromosome pairs, usually 46 chromosomes. One chromosome in each pair comes from each parent. The last pair is shown as two alternatives: XX (female) or XY (male). Chromosome pair 11 is highlighted. Select it to look inside.",
  "Chromosome pair 11 unpacked: one DNA double helix from your mother and one from your father. Each helix has two strands, joined by base pairs. A gene is a stretch of DNA. Select the highlighted stretch to see its sequence.",
  "Two aligned DNA sequences, one strand from each chromosome copy. The letters A, C, G, and T are bases. At the highlighted position, the maternal copy has A and the paternal copy has G: two different alleles. This is a simplified excerpt from a gene, a stretch of DNA with instructions.",
];

/** Measure the label so its leader stays attached at every font size and width. */
function Callout({
  className,
  children,
  targets,
  side = "bottom",
  origin = 0.5,
  targetSelector,
}: {
  className: string;
  children: ReactNode;
  targets?: string;
  targetSelector?: string;
  side?: "top" | "bottom";
  origin?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);
  useLayoutEffect(() => {
    const label = ref.current;
    const frame = label?.closest<HTMLElement>(".genome-zoom-space");
    if (!label || !frame) return;
    const measure = () => {
      const box = label.getBoundingClientRect();
      const drawing = frame.getBoundingClientRect();
      const scaleX = drawing.width / frame.clientWidth || 1;
      const scaleY = drawing.height / frame.clientHeight || 1;
      const targetBox = targetSelector
        ? frame.querySelector(targetSelector)?.getBoundingClientRect()
        : undefined;
      const points = targetBox
        ? [{ x: targetBox.left + targetBox.width / 2, y: targetBox.bottom }]
        : (targets ?? "")
            .split(" ")
            .filter(Boolean)
            .map((target) => {
              const [x, y] = target.split(",").map(Number);
              return {
                x: drawing.left + (x! / 600) * drawing.width,
                y: drawing.top + (y! / 620) * drawing.height,
              };
            });
      setLines(
        points.map((point) => ({
          x1: (box.width / scaleX) * origin,
          y1: side === "top" ? -6 : box.height / scaleY + 6,
          x2: (point.x - box.left) / scaleX,
          y2: (point.y - box.top) / scaleY,
        })),
      );
    };
    let measurementFrame = 0;
    const observer = new ResizeObserver(() => {
      // Apply annotation updates after the browser finishes its resize pass.
      cancelAnimationFrame(measurementFrame);
      measurementFrame = requestAnimationFrame(measure);
    });
    observer.observe(label);
    observer.observe(frame);
    const target = targetSelector ? frame.querySelector(targetSelector) : null;
    if (target) observer.observe(target);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(measurementFrame);
    };
  }, [targets, side, origin, targetSelector]);
  return (
    <div ref={ref} className={`genome-note ${className}`}>
      {children}
      <svg className="genome-label-leader" aria-hidden="true">
        {lines.map((line, index) => (
          <g key={index}>
            <line {...line} />
            <circle cx={line.x2} cy={line.y2} r="2.2" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function Sequence({ paternal = false }: { paternal?: boolean }) {
  const sequence = paternal ? PATERNAL_SEQUENCE : MATERNAL_SEQUENCE;
  return (
    <div
      className={`genome-letter-row ${paternal ? "genome-letter-father" : "genome-letter-mother"}`}
      aria-hidden="true"
    >
      {Array.from(sequence, (base, index) => (
        <span
          key={index}
          className={`genome-letter ${index === VARIANT_INDEX ? "genome-letter-variant" : ""} ${index === 0 && paternal ? "genome-letter-example" : ""}`}
        >
          {base}
        </span>
      ))}
    </div>
  );
}

/** An illustrated introduction. Everything is synthetic; no genome is read. */
export function GenomeExplorer({ appearance = "paper" }: { appearance?: "paper" | "dark" }) {
  const [zoom, setZoom] = useState<GenomeZoom>(0);
  const titleId = useId();
  const figureRef = useRef<HTMLElement>(null);
  const changeZoom = (next: GenomeZoom) => {
    setZoom(next);
    // Keep the next view in place when a hotspot disappears under keyboard focus.
    figureRef.current?.focus({ preventScroll: true });
  };
  const zoomOut = () => changeZoom(Math.max(0, zoom - 1) as GenomeZoom);
  const selected = CHROMOSOMES[FEATURED_PAIR]!;
  const sexPair = CHROMOSOMES[22]!;
  const helixPointer = helixPoint(0.28, 0, helixPose(0));

  return (
    <figure
      className={`genome-explorer ${styles["genome-explorer"]}`}
      data-appearance={appearance}
      ref={figureRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape" && zoom > 0) {
          event.preventDefault();
          zoomOut();
        }
      }}
    >
      <div className="genome-figure-heading">
        <h2 id={titleId}>The human genome</h2>
        {zoom > 0 && (
          <button type="button" className="genome-zoom-out" onClick={zoomOut}>
            <ArrowUpLeft size={17} />
            Zoom out
          </button>
        )}
      </div>
      <div
        className={`genome-zoom-space genome-at-${zoom}`}
        style={
          {
            "--genome-sex-label-y": `${(sexPair.y + sexPair.height / 2 + 12) / 6.2}%`,
            "--sequence-row-left": `${(SEQUENCE_START - SEQUENCE_STEP / 2) / 6}%`,
            "--sequence-row-width": `${(SEQUENCE_STEP * 13) / 6}%`,
            "--sequence-variant-x": `${SEQUENCE_VARIANT_X / 6}%`,
            "--sequence-end": `${SEQUENCE_END / 6}%`,
            "--sequence-mother-y": `${SEQUENCE_Y[0] / 6.2}%`,
            "--sequence-father-y": `${SEQUENCE_Y[1] / 6.2}%`,
          } as CSSProperties
        }
      >
        <div className="genome-zoom-paper" aria-hidden="true" />
        <GenomeScene zoom={zoom} appearance={appearance} />

        <div
          className={`genome-annotations ${zoom === 0 ? "is-current" : ""}`}
          inert={zoom !== 0}
          aria-hidden={zoom !== 0}
        >
          <Callout className="genome-total-note" targets="87,116" origin={0.25}>
            <b>23 PAIRS</b>
            <span>
              Usually 46{" "}
              <a
                href="https://www.genome.gov/genetics-glossary/Chromosome"
                target="_blank"
                rel="noreferrer"
              >
                chromosomes ↗
              </a>
            </span>
          </Callout>
          <Callout className="genome-inheritance-note" targets="516,124 534,124" origin={0.65}>
            <b>INHERITED</b>
            <span>One copy from each parent</span>
          </Callout>
          <button
            type="button"
            className="genome-pair-hotspot"
            style={{ left: `${(selected.x - 43) / 6}%`, top: `${(selected.y - 46) / 6.2}%` }}
            onClick={() => changeZoom(1)}
            tabIndex={zoom === 0 ? 0 : -1}
            aria-label="Zoom into chromosome pair 11"
          >
            <span className="genome-pair-aura" aria-hidden="true" />
            <span className="genome-pair-zoom-badge" aria-hidden="true">
              <ZoomIn size={15} />
            </span>
            <span className="genome-pair-tooltip">Explore chromosome 11</span>
          </button>
          {CHROMOSOMES.map((item, index) => (
            <span
              className={`genome-pair-number ${index === FEATURED_PAIR ? "is-featured" : ""}`}
              key={index}
              style={{
                left: `${item.x / 6}%`,
                top: `${(item.y + item.height * (index === FEATURED_PAIR ? 0.61 : 0.5) + 12) / 6.2}%`,
              }}
              aria-hidden="true"
            >
              {item.label}
            </span>
          ))}
          <Callout className="genome-chromosome-note" targets="89,484" side="top" origin={0.04}>
            <b>CHROMOSOME</b>
            <span>DNA packaged with proteins</span>
          </Callout>
          <div className="genome-sex-alternatives" aria-hidden="true" />
          <span className="genome-sex-or" aria-hidden="true">
            or
          </span>
          <Callout className="genome-sex-note" targetSelector=".genome-sex-alternatives" side="top">
            <span>
              <span aria-hidden="true">👩</span> XX — female
              <br />
              <span aria-hidden="true">👨</span> XY — male
            </span>
          </Callout>
        </div>

        <div
          className={`genome-annotations ${zoom === 1 ? "is-current" : ""}`}
          inert={zoom !== 1}
          aria-hidden={zoom !== 1}
        >
          <svg
            className="genome-leaders"
            viewBox="0 0 600 620"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {[0, 1].map((parent) => (
              <g key={parent}>
                <ellipse
                  className="genome-helix-shadow"
                  data-helix-shadow={parent}
                  cx={parent ? 404 : 196}
                  cy="538"
                  rx="35"
                  ry="5"
                />
                <g
                  className="genome-gene-brackets"
                  data-helix-frame={parent}
                  transform={helixFrameTransform(helixPose(parent))}
                >
                  <path d="M-31 -80C-57 -76 -55 -35 -55 0S-57 76 -31 80M31 -80C57 -76 55 -35 55 0S57 76 31 80" />
                </g>
                <path
                  className="genome-gene-brackets"
                  data-helix-connector={parent}
                  d={helixConnector(parent, helixPose(parent))}
                />
              </g>
            ))}
          </svg>
          <Callout
            className="genome-helix-note"
            targets={`${helixPointer.x},${helixPointer.y}`}
            origin={0.3}
          >
            <b>DOUBLE HELIX</b>
            <span>
              Two strands
              <br />
              of one DNA
              <br />
              molecule
            </span>
          </Callout>
          {[false, true].map((paternal) => (
            <button
              type="button"
              key={String(paternal)}
              className={`genome-gene-copy ${paternal ? "genome-gene-copy-father" : "genome-gene-copy-mother"}`}
              onClick={() => changeZoom(2)}
              tabIndex={zoom === 1 ? 0 : -1}
              aria-label={`Zoom into ${paternal ? "father’s" : "mother’s"} gene copy`}
            />
          ))}
          <button
            type="button"
            className="genome-gene-zoom"
            onClick={() => changeZoom(2)}
            tabIndex={zoom === 1 ? 0 : -1}
            aria-label="Zoom into the highlighted gene"
          >
            <ZoomIn size={18} />
            Zoom in
          </button>
          <Callout className="genome-gene-note" targets="300,319" side="top">
            <b>GENE</b>
            <span>A stretch of DNA</span>
          </Callout>
          <span className="genome-parent-note genome-parent-mother">
            <i />
            Mother’s copy
          </span>
          <span className="genome-parent-note genome-parent-father">
            <i />
            Father’s copy
          </span>
        </div>

        <div
          className={`genome-annotations ${zoom === 2 ? "is-current" : ""}`}
          inert={zoom !== 2}
          aria-hidden={zoom !== 2}
        >
          <svg
            className="genome-leaders genome-sequence-leaders"
            viewBox="0 0 600 620"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d={`M${SEQUENCE_START} ${SEQUENCE_Y[0] - 32}Q${SEQUENCE_START} ${SEQUENCE_Y[0] - 42} ${SEQUENCE_START + 10} ${SEQUENCE_Y[0] - 42}H${SEQUENCE_END - 10}Q${SEQUENCE_END} ${SEQUENCE_Y[0] - 42} ${SEQUENCE_END} ${SEQUENCE_Y[0] - 32}`}
            />
          </svg>
          <Callout
            className="genome-sequence-gene-note"
            targets={`${SEQUENCE_VARIANT_X},${SEQUENCE_Y[0] - 42}`}
          >
            <b>INSIDE A GENE</b>
            <span>A stretch of DNA with instructions</span>
          </Callout>
          <div className="genome-gene-wash" aria-hidden="true" />
          <span className="genome-sequence-parent genome-sequence-parent-mother">
            Mother’s
            <br />
            copy
          </span>
          <Sequence />
          <Callout
            className="genome-base-note"
            targetSelector=".genome-letter-example"
            side="top"
            origin={0.05}
          >
            <b>BASE</b>
            <span>One DNA letter</span>
          </Callout>
          <span className="genome-sequence-parent genome-sequence-parent-father">
            Father’s
            <br />
            copy
          </span>
          <Sequence paternal />
          <Callout
            className="genome-allele-note"
            targetSelector=".genome-letter-father .genome-letter-variant"
            side="top"
            origin={0.05}
          >
            <b>ALLELES</b>
            <span>
              <strong>A</strong> and <strong>G</strong>: two inherited bases
              <br />
              at the same DNA position.
            </span>
          </Callout>
        </div>
      </div>
      <p className="genome-screen-reader" role="status" aria-live="polite" aria-atomic="true">
        {descriptions[zoom]}
      </p>
    </figure>
  );
}
