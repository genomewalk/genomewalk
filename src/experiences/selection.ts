import type { Experience, SavedSelection } from "./types.ts";
// A filename alone is not a usable selection. The reader and header must still
// belong to the current experience before any page offers chapter navigation.
export function describeSelection(experience: Experience): SavedSelection | null {
  const { source, header } = experience.context;
  const { fileName, kind } = experience.session;
  if (!source?.file || !header || !fileName) return null;
  const info = experience.describe();
  return {
    experienceId: experience.id,
    name: fileName,
    kind: kind ?? "upload",
    source,
    header,
    info,
    selectedBuild: info.selectedBuild,
  };
}

export function restoreSelection(
  experiences: Experience[],
  selection: SavedSelection | null | undefined,
) {
  if (!selection?.source?.file || !selection.header || !selection.name) return null;
  const experience = experiences.find((item) => item.id === selection.experienceId);
  if (!experience) return null;
  // Keep the file handle through a development update, but rerun changed lessons
  // instead of restoring DOM nodes or results produced by the previous code.
  experience.select(selection, selection.name, selection.kind);
  return experience;
}
