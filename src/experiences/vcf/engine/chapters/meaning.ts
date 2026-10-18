import { meaningIntroduction, meaningChapterHtml } from "../../../shared/meaning-chapter.ts";
import { ensureHeader } from "../runtime.ts";
import { el } from "../view/html.ts";
import { currentBuild } from "../context.ts";

export const meaningChapter = {
  ...meaningIntroduction,
  async run(out: HTMLElement) {
    await ensureHeader();
    out.append(
      el("div", "meaning-chapter", meaningChapterHtml({ format: "vcf", build: currentBuild() })),
    );
  },
};
