# Third-party notices

The root MIT license applies to Genomewalk source. It does not replace the
licenses or data-use terms of the following projects and scientific sources.
Dependencies are installed from npm; their original license files are included
in those packages. Preserve applicable notices when distributing bundled builds.
`package-lock.json` records the resolved dependency graph.

| Runtime dependency        | Use                                    | License |
| ------------------------- | -------------------------------------- | ------- |
| React and React DOM       | Page components and rendering          | MIT     |
| TanStack Router and Start | Routing and server-rendered app shell  | MIT     |
| Three.js                  | Illustrative genetics scenes           | MIT     |
| Lucide React              | Interface icons                        | ISC     |
| fflate                    | Local BGZF, gzip and ZIP decompression | MIT     |

Both browser experiences and the offline tools use the declared `fflate`
dependency. Its attribution remains in the installed package, with an additional
MIT notice in `licenses/fflate-MIT.txt`. Vite,
Tailwind, TypeScript, ESLint, Prettier and their plugins have separate
licenses in their respective npm packages; they are not Genomewalk-authored code.
The offline ClinVar citation importer uses `saxes` (ISC) and its `xmlchars`
dependency (MIT). They are build-time dependencies, not browser assets.

The page requests Instrument Serif, DM Sans and IBM Plex Mono through Google
Fonts. Their font distributions contain their own open-font license notices.
This repository does not include those font binaries.

## Scientific data

- ClinVar is provided by the US National Library of Medicine / NCBI. Preserve
  record identifiers, classifications, review status, citations and source dates.
  See [NCBI policies](https://www.ncbi.nlm.nih.gov/home/about/policies/) and
  [ClinVar documentation](https://www.ncbi.nlm.nih.gov/clinvar/docs/).
- gnomAD frequencies are a separate evidence source. See
  [gnomAD terms](https://gnomad.broadinstitute.org/terms) and the linked versioned
  sources in `scripts/README.md`. UCSC redistributes the bigBed data used by the
  offline build; its downloaded tools are kept in the ignored `data/` cache.
- Compact publication labels use bibliographic metadata from NLM/NCBI PubMed
  ESummary. Preserve PMID links and the PubMed source attribution. The offline
  cache records retrieval dates; abstracts and article text are not redistributed.
  See [PubMed documentation](https://pubmed.ncbi.nlm.nih.gov/help/) and
  [NCBI E-utilities guidance](https://www.ncbi.nlm.nih.gov/books/NBK25497/).
- The public NIST Genome in a Bottle HG002 VCF retains the provenance, checksums
  and upstream usage links in [public/samples/README.md](public/samples/README.md).
- Research explanations link their original studies. The source and wording
  audit is in [scripts/STUDY_SOURCES.md](scripts/STUDY_SOURCES.md).

Provider names identify compatible export formats. Genomewalk does not claim
affiliation with, or endorsement by, those providers.
