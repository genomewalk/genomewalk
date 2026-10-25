import { AppError } from "../lib/app-error.ts";
import type { Experience, OpenedGenome, SelectionKind } from "./types.ts";
import type { Progress } from "../lib/io/types.ts";
import vcf from "./vcf/index.ts";
import { optionalExperiences } from "./optional.ts";
import { describeSelection, restoreSelection } from "./selection.ts";
import type { HttpRangeSource } from "../lib/io/http-range.ts";
import { hasCompressedVcfHeader } from "../lib/intake/vcf-format.ts";
import { withReadingContext } from "../lib/diagnostics/reading.ts";

let current: Experience =
  restoreSelection([vcf, ...optionalExperiences], import.meta.hot?.data.selection) || vcf;
export const getExperience = () => current;
export const getGenomeSelection = () => describeSelection(current);
export const acceptedFiles = [vcf, ...optionalExperiences].map((x) => x.accept).join(",");
export const inputDescription = [vcf, ...optionalExperiences].map((x) => x.label).join(" · ");

export async function openGenomeFile(file: File, signal?: AbortSignal, onProgress?: Progress) {
  try {
    signal?.throwIfAborted();
    if (!file.size)
      throw new AppError("FILE_EMPTY", "This file is empty. Choose a complete DNA file.");
    let experience = ([vcf, ...optionalExperiences] as Experience[]).find((x) => x.matches(file));
    if (
      experience !== vcf &&
      /\.(?:gz|bgz)$/i.test(file.name) &&
      (await hasCompressedVcfHeader(file, signal))
    )
      experience = vcf;
    signal?.throwIfAborted();
    if (!experience)
      throw new AppError("FILE_TYPE_UNSUPPORTED", `Supported files: ${inputDescription}.`);
    const opened = await experience.open(file, signal, onProgress);
    signal?.throwIfAborted();
    return { ...opened, experience };
  } catch (error) {
    throw withReadingContext(error, { readingStep: "format-detection" });
  }
}

export async function openPublicSample(source: HttpRangeSource, signal?: AbortSignal) {
  const opened = await vcf.openSource(source, signal);
  signal?.throwIfAborted();
  return { ...opened, experience: vcf };
}

export function selectGenome(opened: OpenedGenome, name: string, kind?: SelectionKind) {
  current.clear();
  current = opened.experience;
  current.select(opened, name, kind);
  // Save at selection time: dependency updates can re-evaluate this registry
  // without running its dispose callback. Vite keeps this only in page memory.
  if (import.meta.hot) import.meta.hot.data.selection = getGenomeSelection();
}
