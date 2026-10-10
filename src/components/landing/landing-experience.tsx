import { useEffect, useRef, type ReactNode } from "react";
import { ArrowDown, ArrowUpRight, ShieldCheck } from "lucide-react";
import { LandingMolecule } from "./landing-molecule.tsx";
import styles from "./landing-experience.module.css";

/** All experimental styles and motion stay inside the home page. */
export function LandingShell({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hero = root.querySelector<HTMLElement>(".observatory");
    const stage = root.querySelector<HTMLElement>(".observatory-stage");
    const specimen = root.querySelector<HTMLElement>(".specimen-section");
    const specimenContent = root.querySelector<HTMLElement>(".specimen-content");
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    let frame = 0;

    const update = () => {
      frame = 0;
      const enabled = !reduced.matches;
      const viewport = window.innerHeight;
      const stageHeight = stage?.offsetHeight ?? viewport;
      root.style.setProperty("--hero-stage-height", `${stageHeight}px`);
      const heroTravel = hero
        ? Math.max(1, hero.offsetHeight - Math.min(viewport, stageHeight))
        : 1;
      // Measure the stationary section so its animated child cannot feed back into progress.
      const sectionTop = specimen?.getBoundingClientRect().top ?? viewport;
      const contentTop = sectionTop + (specimenContent?.offsetTop ?? 0);
      const arrivalProgress = clamp((viewport - contentTop) / (viewport * 0.8));
      const arrivalEased = arrivalProgress * arrivalProgress * (3 - 2 * arrivalProgress);
      const heroPullback = hero ? clamp(-hero.getBoundingClientRect().top / heroTravel) : 0;
      // Continue the hero's pullback while the next scene grows into view.
      const heroProgress = heroPullback * 0.55 + arrivalEased * 0.45;
      const departure = specimen ? clamp(-sectionTop / (specimen.offsetHeight * 0.85)) : 0;
      hero?.style.setProperty("--hero-scroll", String(enabled ? heroProgress : 0));
      specimen?.style.setProperty("--departure", String(enabled ? departure : 0));
      specimen?.style.setProperty("--arrival", String(enabled ? 1 - arrivalEased : 0));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            reveal.unobserve(entry.target);
          }
      },
      { threshold: 0.1, rootMargin: "0px 0px -24px 0px" },
    );
    root.querySelectorAll("[data-landing-reveal]").forEach((element) => reveal.observe(element));
    const resize = new ResizeObserver(schedule);
    if (stage) resize.observe(stage);
    if (specimen) resize.observe(specimen);
    update();
    root.classList.add("landing-motion-ready");
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    reduced.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      reveal.disconnect();
      resize.disconnect();
      root.classList.remove("landing-motion-ready");
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
    };
  }, []);

  return (
    <div
      id="top"
      className={`site-shell landing-experiment ${styles["landing-experiment"]}`}
      ref={rootRef}
    >
      {children}
    </div>
  );
}

export function ImmersiveHero({ children }: { children: ReactNode }) {
  return (
    <section className="observatory" aria-labelledby="hero-title">
      <div className="observatory-stage">
        <div className="observatory-halo" aria-hidden="true" />
        <div className="observatory-contours" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="observatory-sequence" aria-hidden="true">
          A · T · C · G · A · C · T · G
        </div>
        <LandingMolecule />
        <div className="observatory-content page-width">
          <div className="observatory-copy">
            <div className="section-eyebrow">
              <span className="observatory-signal" /> A FIELD GUIDE TO YOUR GENOME
            </div>
            <h1 id="hero-title">
              Your genome,
              <br />
              <em>one discovery</em>
              <br />
              at a time.
            </h1>
            <p>
              A world of information, written in four letters.
              <br />
              Take a closer look at the story in your DNA.
            </p>
            <div className="hero-actions">
              <a href="#specimen" className="btn">
                Explore your genome <ArrowUpRight size={18} />
              </a>
              <div className="hero-privacy-promise">
                <ShieldCheck size={24} strokeWidth={1.4} aria-hidden="true" />
                <p>
                  Your DNA file is <strong>never uploaded.</strong>
                </p>
              </div>
            </div>
          </div>
          <div className="observatory-explorer" id="genome">
            <div className="observatory-plate">{children}</div>
            <p className="observatory-explorer-hint">
              <span>↗</span> Start with chromosome 11. Each click takes you a little closer.
            </p>
          </div>
        </div>
        <div className="observatory-footer page-width">
          <a href="#specimen" className="observatory-scroll">
            <span>
              <ArrowDown size={17} />
            </span>{" "}
            SCROLL TO BEGIN
          </a>
        </div>
      </div>
    </section>
  );
}
