import { LandingMolecule } from "../landing/landing-molecule.tsx";
import styles from "./chapter-background.module.css";

/** A quiet, paper-toned version of the home page's decorative DNA scene. */
export function ChapterBackground() {
  return (
    <div className={styles["chapter-background"]} aria-hidden="true">
      <div className={styles["chapter-background-contours"]}>
        <i />
        <i />
        <i />
      </div>
      <LandingMolecule animated={false} />
    </div>
  );
}
