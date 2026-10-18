import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { SupportedBuild } from "../lib/genetics/reference-build.ts";
import styles from "./build-choice.module.css";

export function BuildChoice({
  active,
  fileName,
  onBack,
  onContinue,
}: {
  active: boolean;
  fileName: string;
  onBack: () => void;
  onContinue: (build: SupportedBuild | null) => void;
}) {
  const [choice, setChoice] = useState<SupportedBuild | "other" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (active) heading.current?.focus();
  }, [active]);

  return (
    <form
      className={styles["build-choice"]}
      aria-labelledby="build-choice-title"
      onSubmit={(event) => {
        event.preventDefault();
        if (choice) onContinue(choice === "other" ? null : choice);
      }}
    >
      <div className={styles["file-row"]}>
        <button
          type="button"
          className={styles["back"]}
          aria-label="Back to file selection"
          onClick={onBack}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back
        </button>
        <span className={styles["file-name"]} title={fileName}>
          {fileName}
        </span>
      </div>
      <h3 ref={heading} tabIndex={-1} id="build-choice-title">
        Which reference build does this file use?
      </h3>
      <p id="build-choice-help">
        We couldn’t identify it from the file. Check your provider’s download page or report.
      </p>
      <fieldset aria-labelledby="build-choice-title" aria-describedby="build-choice-help">
        {(
          [
            ["GRCh37", "GRCh37 / hg19"],
            ["GRCh38", "GRCh38 / hg38"],
            ["other", "Another build / I’m not sure"],
          ] as const
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="reference-build"
              value={value}
              checked={choice === value}
              onChange={() => setChoice(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <div className={styles["actions"]}>
        <p className={styles["choice-note"]} aria-live="polite">
          <span aria-hidden={choice === "other"}>
            You can explore the file and match variants against public catalogues.
          </span>
          <span aria-hidden={choice !== "other"}>
            You can explore the file without catalogue matching.
          </span>
        </p>
        <button type="submit" className="btn" disabled={!choice}>
          Continue <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
