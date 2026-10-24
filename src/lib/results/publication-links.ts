import { PublicationCatalogue } from "../catalogues/publications.ts";
import { reportError } from "../error-reporting.ts";

const publications = new PublicationCatalogue(undefined, (error) =>
  reportError(error, "publications"),
);

/** Enhance existing working links after render; metadata never delays genome results. */
export async function hydratePublicationLinks(root: ParentNode, catalogue = publications) {
  const links = [...root.querySelectorAll<HTMLAnchorElement>("a[data-pmid]")];
  if (!links.length) return;
  try {
    const labels = await catalogue.load(links.map((link) => link.dataset["pmid"]!));
    for (const link of links) {
      const label = labels[link.dataset["pmid"]!];
      if (label) link.textContent = `${label} ↗`;
    }
  } catch {
    // Missing/offline metadata leaves the original PMID links usable.
  }
}
