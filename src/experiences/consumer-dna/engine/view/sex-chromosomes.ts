import { fmt, kvx } from "./html.ts";
import {
  sexChromosomeIntro,
  sexChromosomeDiagram,
} from "../../../../components/diagrams/sex-chromosome-explanation.ts";

export function sexChromosomeFinding(
  summary: {
    build: string;
    X: {
      sites: number;
      called: number;
      differing: number;
      single: number;
      first: number;
      last: number;
      firstCall: number;
      lastCall: number;
    };
    Y: {
      sites: number;
      called: number;
      differing: number;
      single: number;
      first: number;
      last: number;
      firstCall: number;
      lastCall: number;
    };
    xRate: number | null;
    yRate: number | null;
    estimate: "XX" | "XY" | null;
  } | null,
) {
  if (!summary?.estimate) return null;
  const { X, Y, estimate } = summary;
  const label = estimate === "XY" ? "Likely male (XY)" : "Likely female (XX)";
  const same = X.called - X.differing;
  const sameDescription =
    X.single === X.called
      ? "report a single letter"
      : X.single === 0
        ? "have matching letters"
        : "report one letter or matching letters";
  return kvx(
    "Genetic sex",
    `<code>${label}</code>`,
    `${sexChromosomeIntro("consumer", estimate)}
     ${sexChromosomeDiagram(estimate, "consumer")}
     <p>Of the <b>${fmt(X.called)} distinct X sites</b> checked here, <b>${fmt(same)}</b> ${sameDescription}. ${
       X.differing
         ? `<b>${fmt(X.differing)}</b> have two different letters, such as <code>AG</code>.`
         : "None have two different letters, such as <code>AG</code>."
     }</p>
     <p>${
       estimate === "XY"
         ? `<b>${fmt(Y.called)} Y sites</b> also have reported DNA letters.`
         : "No Y sites had usable DNA letters."
     } Together, these calls suggest a <b>${estimate === "XY" ? "likely male (XY)" : "likely female (XX)"}</b> pattern.</p>`,
  );
}
