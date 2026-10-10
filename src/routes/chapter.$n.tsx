import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import type { Experience } from "../experiences/types.ts";
import VcfChapterPage from "../experiences/vcf/chapter-page.tsx";
import { GeneticsLoader } from "../components/genetics-loader.tsx";
import { getExperience } from "../experiences/index.ts";

const pages = new WeakMap<Experience, LazyExoticComponent<ComponentType<{ n: string }>>>();
export const Route = createFileRoute("/chapter/$n")({
  head: ({ params }) => {
    const i = Number.parseInt(params.n, 10) - 1;
    const step = getExperience().chapters[i];
    const title = step
      ? `Chapter ${params.n}: ${step.title} — Genomewalk`
      : "Chapter not found — Genomewalk";
    return {
      meta: [
        { title },
        {
          name: "description",
          content: step
            ? `Chapter ${params.n} of the in-browser genome walkthrough: ${step.title}. Your genome file is not uploaded.`
            : "This chapter does not exist.",
        },
        { property: "og:title", content: title },
        { property: "og:type", content: "article" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: ChapterRoute,
});

function ChapterRoute() {
  const { n } = Route.useParams();
  const experience = getExperience();
  if (experience.id === "vcf") return <VcfChapterPage n={n} />;
  if (!pages.has(experience)) pages.set(experience, lazy(experience.loadPage!));
  const Page = pages.get(experience)!;
  return (
    <Suspense fallback={<GeneticsLoader label="Opening this chapter…" />}>
      <Page n={n} />
    </Suspense>
  );
}
