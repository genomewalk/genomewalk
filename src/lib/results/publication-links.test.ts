import test from "node:test";
import assert from "node:assert/strict";
import { hydratePublicationLinks } from "./publication-links.ts";
import { resultSources } from "./sources.ts";
import type { PublicationCatalogue } from "../catalogues/publications.ts";

test("publication links retain their destinations and treat metadata as text, including fallback", async () => {
  const links = ["19320537", "99"].map((id) => ({
    dataset: { pmid: id },
    href: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    textContent: `PMID ${id} ↗`,
  }));
  const root = { querySelectorAll: () => links } as unknown as ParentNode;
  const catalogue = {
    load: async () => ({ "19320537": "Brooks et al., PLoS Medicine 2009", "99": null }),
  } as unknown as PublicationCatalogue;
  await hydratePublicationLinks(root, catalogue);
  assert.equal(links[0]!.textContent, "Brooks et al., PLoS Medicine 2009 ↗");
  assert.equal(links[0]!.href, "https://pubmed.ncbi.nlm.nih.gov/19320537/");
  assert.equal(links[1]!.textContent, "PMID 99 ↗");
  await hydratePublicationLinks(root, {
    load: async () => {
      throw new Error("offline");
    },
  } as unknown as PublicationCatalogue);
  assert.equal(links[1]!.textContent, "PMID 99 ↗");
  await hydratePublicationLinks(root, {
    load: async () => ({ "19320537": "<img src=x onerror=alert(1)>" }),
  } as unknown as PublicationCatalogue);
  assert.equal(links[0]!.textContent, "<img src=x onerror=alert(1)> ↗");
});

test("shared result sources expose only validated, deduplicated PMID links for enrichment", () => {
  const html = resultSources({
    variationId: "123",
    pmids: ["19320537", "19320537", "2", "3", "4", '"><script>'],
  });
  assert.equal((html.match(/data-pmid=/g) || []).length, 3);
  assert.match(html, /data-pmid="19320537"/);
  assert.match(html, /All 4 on ClinVar/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(resultSources({ pmids: [] }), /No publication links available/);
});
