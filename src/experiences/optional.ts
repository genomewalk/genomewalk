import type { Experience } from "./types.ts";
import consumerDNA from "./consumer-dna/index.ts";

// To remove consumer support, replace this whole file with:
// import type { Experience } from "./types.ts";
// export const optionalExperiences: Experience[] = [];
// Then delete consumer-dna/. No VCF page, engine or test needs editing.
export const optionalExperiences: Experience[] = [consumerDNA];
