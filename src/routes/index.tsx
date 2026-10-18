import { ArrowUpRight, Check, FolderOpen, MoveRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { GenomeExplorer } from "../components/genome-explorer/genome-explorer.tsx";
import { ImmersiveHero, LandingShell } from "../components/landing/landing-experience.tsx";
import { GeneticsLoader } from "../components/genetics-loader.tsx";
import { BuildChoice } from "../components/build-choice.tsx";
import { SiteHeader, SiteFooter } from "../components/brand.tsx";
import { createFileRoute, Link } from "@tanstack/react-router";
import * as experiences from "../experiences/index.ts";
import { useGenomeIntake } from "../lib/intake/use-genome-intake.ts";
import { SAMPLE } from "../lib/catalogues/public-sample.ts";
import { FILE_CHAPTERS, RESULTS_STEP } from "../lib/navigation/journey.ts";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { view?: "results" } =>
    search["view"] === "results" ? { view: "results" } : {},
  head: () => ({
    meta: [
      { title: "Genomewalk — read your genome file, step by step" },
      {
        name: "description",
        content:
          "Load a .vcf.gz and learn what a whole-genome file reveals using nothing but itself. Analysis runs in your browser — your genome file is not uploaded.",
      },
      { property: "og:title", content: "Genomewalk — read your genome file, step by step" },
      {
        property: "og:description",
        content:
          "A private, in-browser tour of a whole-genome VCF: header facts, one variant line explained, a full counting pass, and what it all implies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type StepDef = {
  title: string;
  why: string;
  blurb?: string;
  run: (out: HTMLElement) => Promise<void>;
};

const MB = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
function Index() {
  const experience = experiences.getExperience();
  const steps = experience.chapters as StepDef[];
  const session = experience.session;
  const { view } = Route.useSearch();
  const {
    fetching,
    loadError,
    preparing,
    readProgress,
    drag,
    setDrag,
    fileInput,
    busy,
    onPick,
    onDrop,
    loadSample,
    pendingBuild,
    confirmBuild,
    cancelBuild,
  } = useGenomeIntake(view);
  const pickerButton = useRef<HTMLButtonElement>(null);
  const returningToPicker = useRef(false);
  useEffect(() => {
    if (!pendingBuild && returningToPicker.current) {
      returningToPicker.current = false;
      pickerButton.current?.focus();
    }
  }, [pendingBuild]);
  const selected = experiences.getGenomeSelection();
  const fileName = selected?.name || null;
  const info = selected?.info;

  const completed = Object.values(session.done).filter(Boolean).length;
  return (
    <LandingShell>
      <SiteHeader />
      <main>
        <ImmersiveHero>
          <GenomeExplorer appearance="dark" />
        </ImmersiveHero>
        <div className="landing-body">
          <section
            id="specimen"
            className="specimen-section page-width"
            aria-labelledby="specimen-title"
          >
            <div className="specimen-content">
              <div className="specimen-intro">
                <div className="section-eyebrow">
                  <span className="section-index">01 /</span> THE STARTING POINT
                </div>
                <h2 id="specimen-title">
                  A whole story.
                  <br />
                  <em>One small file.</em>
                </h2>
                <div className="privacy-note" id="privacy">
                  <p>
                    Choose your own genome or explore the public sample. Analysis runs directly in
                    your browser.
                  </p>
                  <p className="specimen-policy-links">
                    Before opening a personal file, read our{" "}
                    <Link to="/privacy">Privacy Policy</Link> and{" "}
                    <Link to="/terms">Terms of Use</Link>, including the medical disclaimer.
                  </p>
                </div>
              </div>
              <div className="specimen-loader">
                <div className="loader-top">
                  <span>
                    <i className="live-dot" /> CHOOSE A GENOME
                  </span>
                  <span>
                    {pendingBuild
                      ? "BUILD CHOICE"
                      : busy
                        ? "OPENING FILE"
                        : fileName
                          ? "FILE READY"
                          : "FILE OR SAMPLE"}
                  </span>
                </div>
                <div className="intake-steps">
                  <div className="intake-step" aria-hidden={!pendingBuild} inert={!pendingBuild}>
                    <BuildChoice
                      key={pendingBuild?.id ?? 0}
                      active={!!pendingBuild}
                      fileName={pendingBuild?.name ?? "Your selected file"}
                      onBack={() => {
                        returningToPicker.current = true;
                        cancelBuild();
                      }}
                      onContinue={confirmBuild}
                    />
                  </div>
                  <div className="intake-step" aria-hidden={!!pendingBuild} inert={!!pendingBuild}>
                    <section
                      className={`file-drop${drag ? " drag" : ""}${fileName ? " file-ready" : ""}`}
                      aria-label={fileName ? "Current genome" : "Use your own genome"}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDrag(true);
                      }}
                      onDragLeave={() => setDrag(false)}
                      onDrop={onDrop}
                    >
                      <div className="file-symbol">
                        {fileName ? (
                          <Check size={28} strokeWidth={1.3} />
                        ) : (
                          <FolderOpen size={28} strokeWidth={1.3} />
                        )}
                      </div>
                      {fileName ? (
                        <>
                          <span className="section-eyebrow">
                            {session.kind === "sample"
                              ? "Public sample · this visit"
                              : "Your file · this visit"}
                          </span>
                          <h3 className="specimen-name">{fileName}</h3>
                          <p className="file-description">{`${MB(info!.size)} · build ${info!.build}${info!.selectedBuild ? " · Selected by you" : ""}`}</p>
                          {busy ? (
                            <button type="button" className="btn" disabled>
                              Opening your file…
                            </button>
                          ) : (
                            <Link
                              to="/chapter/$n"
                              params={{ n: view === "results" ? String(RESULTS_STEP + 1) : "1" }}
                              className="btn"
                            >
                              {view === "results" ? "Open your results" : "Start from chapter 1"}{" "}
                              <MoveRight size={17} />
                            </Link>
                          )}
                          <button
                            ref={pickerButton}
                            type="button"
                            className="change-file"
                            disabled={preparing}
                            onClick={() => fileInput.current?.click()}
                          >
                            Choose a different file
                          </button>
                        </>
                      ) : (
                        <>
                          <h3>Use your own genome</h3>
                          <p className="file-description">{experiences.inputDescription}</p>
                          <button
                            ref={pickerButton}
                            type="button"
                            className="btn"
                            disabled={preparing}
                            onClick={() => fileInput.current?.click()}
                          >
                            Choose genome file <FolderOpen size={17} />
                          </button>
                          {!preparing && <p className="drop-hint">or drag and drop it here</p>}
                        </>
                      )}
                      {preparing && (
                        <GeneticsLoader
                          label="Reading your file…"
                          progress={readProgress}
                          compact
                        />
                      )}
                    </section>
                    <input
                      ref={fileInput}
                      type="file"
                      accept={experiences.acceptedFiles}
                      hidden
                      onChange={onPick}
                      aria-label="Choose a genome file"
                    />
                    <div className="sample-choice">
                      <button
                        type="button"
                        className="sample-link"
                        onClick={loadSample}
                        disabled={fetching != null || preparing}
                      >
                        <span className="sample-link-label">Use sample genome {SAMPLE.label}</span>{" "}
                        <span className="sample-details">
                          (NIST Genome in a Bottle · GRCh38 · {SAMPLE.size})
                        </span>
                      </button>
                      {fetching != null && (
                        <GeneticsLoader
                          label="Loading sample genome…"
                          progress={fetching}
                          compact
                        />
                      )}
                    </div>
                  </div>
                </div>
                {loadError && (
                  <p className="err specimen-error" role="alert">
                    {loadError}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section id="steps" className="curriculum page-width" aria-labelledby="curriculum-title">
            <div className="curriculum-heading" data-landing-reveal>
              <div>
                <div className="section-eyebrow">
                  <span className="section-index">02 /</span> THE FIELD GUIDE
                </div>
                <h2 id="curriculum-title">
                  Follow the <em>sequence.</em>
                </h2>
              </div>
              <div className="curriculum-meta">
                <span>Contents — {steps.length} chapters</span>
                {fileName ? (
                  <span className="progress-caption">
                    {completed} of {steps.length} complete
                  </span>
                ) : (
                  <p>
                    Choose your file or the public sample above to begin.
                    <br />
                    Explore the chapters in any order, or go straight to Your results.
                  </p>
                )}
              </div>
            </div>
            {[0, 1].map((part) => (
              <div className="curriculum-part" key={part}>
                <div className="part-label" data-landing-reveal>
                  <span className="part-number">{part === 0 ? "I" : "II"}</span>
                  <div>
                    <span className="section-eyebrow">PART {part === 0 ? "ONE" : "TWO"}</span>
                    <h3>{part === 0 ? "The file alone" : "The file + public catalogues"}</h3>
                  </div>
                  <span className="part-range">
                    {part === 0
                      ? `01—${String(FILE_CHAPTERS).padStart(2, "0")}`
                      : `${String(FILE_CHAPTERS + 1).padStart(2, "0")}—${String(steps.length).padStart(2, "0")}`}
                  </span>
                </div>
                <ol className="chapter-list" start={part === 0 ? 1 : FILE_CHAPTERS + 1}>
                  {steps
                    .slice(
                      part === 0 ? 0 : FILE_CHAPTERS,
                      part === 0 ? FILE_CHAPTERS : steps.length,
                    )
                    .map((step, j) => {
                      const i = (part === 0 ? 0 : FILE_CHAPTERS) + j;
                      return (
                        <li
                          className={`chapter-row${session.done[i] ? " complete" : ""}`}
                          key={step.title}
                          data-landing-reveal
                        >
                          <span className="chapter-number">{String(i + 1).padStart(2, "0")}</span>
                          <div className="chapter-row-copy">
                            <h3>{step.title}</h3>
                            <p>{step.blurb ?? ""}</p>
                          </div>
                          {busy ? (
                            <button
                              type="button"
                              className="chapter-open"
                              disabled
                              aria-label={
                                pendingBuild
                                  ? `Choose a reference build before opening chapter ${i + 1}`
                                  : `Opening file — chapter ${i + 1} will be available shortly`
                              }
                            >
                              <ArrowUpRight size={20} />
                            </button>
                          ) : fileName || i === RESULTS_STEP ? (
                            <Link
                              to="/chapter/$n"
                              params={{ n: String(i + 1) }}
                              className="chapter-open"
                              aria-label={`${session.done[i] ? "Revisit" : "Open"} chapter ${i + 1}: ${step.title}`}
                            >
                              <span>{session.done[i] ? "Revisit" : "Open"}</span>
                              {session.done[i] ? <Check size={19} /> : <ArrowUpRight size={20} />}
                            </Link>
                          ) : (
                            <a
                              href="#specimen"
                              className="chapter-open"
                              aria-label={`Load a file to begin chapter ${i + 1}`}
                            >
                              <ArrowUpRight size={20} />
                            </a>
                          )}
                        </li>
                      );
                    })}
                </ol>
              </div>
            ))}
          </section>
        </div>
      </main>
      <SiteFooter />
    </LandingShell>
  );
}
