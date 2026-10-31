# Genomewalk

An educational field guide to a DNA data file. Open a file in your browser,
explore the chapters in any order, or go straight to **Your results**.
Personal DNA files are read locally. The browser streams a public catalogue,
matches records locally and keeps the matching results. Sorted VCFs and catalogue
rows are compared progressively without retaining either complete dataset.
No genome upload endpoint or remote matching API is used.

## Run locally

With Docker installed and running, build and open the static site with one command:

```sh
docker compose up --build       # http://localhost:5283
```

The build runs the release checks. Press Ctrl+C to stop. Re-run the command after
editing code or rebuilding public references. No Node installation is required.

For development with hot reload, use Node.js **24 LTS** and npm:

```sh
npm ci
npm run dev       # http://localhost:5282
npm run check     # tests, TypeScript, lint and production build
npm run check:release  # full checks, public reference validation and static preflight
npm run benchmark     # verify matching correctness with the bundled HG002 sample
```

After moving source modules or changing dependencies, stop the running dev server
with Ctrl+C and restart it with `npm run dev -- --force`. Reload the page and
select the file again. Use the URL printed by that server; an older process on a
different port can keep serving stale modules. Keep one dev server per checkout.

The optional [correctness benchmark](docs/BENCHMARKS.md) checks complete matching
results against a simple reference lookup. It reports pass/fail and provenance;
it does not compare retrieval methods or measure performance.

The application uses React, TanStack Start, Vite and Three.js. **The deployable site
is entirely static:** `npm run build` prerenders the pages into **`dist/client/`**,
and `npm run preview` serves that folder at `http://localhost:5283`.
GitHub Pages publishes it at `genomewalk.com`. See the
[deployment guide](docs/DEPLOYMENT.md) for hosting, catalogue streaming, public-sample byte ranges,
domain setup and the deployment and reference-data workflows.

## Supported files

| File                                                                        | What Genomewalk reads                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| BGZF-compressed VCF / gVCF (`.vcf.gz`, `.vcf.bgz`, `.gvcf.gz`, `.gvcf.bgz`) | Header, first sample, literal alleles and available quality fields |
| 23andMe raw TXT, ZIP or gzip                                                | Four-column genotype export with its original header               |
| AncestryDNA raw TXT, ZIP or gzip                                            | Five-column allele export with its original header                 |

Compressed files with generic `.gz` / `.bgz` names are checked incrementally
until their format prefix is identified so a BGZF VCF can use the streaming reader.
Ordinary gzip VCFs need to be recompressed with bgzip. A consumer ZIP may include
documentation alongside one supported DNA export. ZIP-wrapped VCFs must be
extracted first; split and ZIP64 consumer archives are not supported.

There are no application-imposed file-size, decoded-size, row-count, header-length,
line-length or archive-entry-count cutoffs for supported inputs. Browser memory
and processing time still constrain large files. In particular, consumer archives
currently retain their decoded text in memory; VCF/gVCF data streams in blocks.
Format-defined block sizes, checksums and completeness checks remain enforced.

Sorted VCF matching retains the current genomic position and completed results
while releasing processed catalogue blocks. Unsorted VCFs fall back to a compact
public-identity lookup and additional catalogue passes. Consumer matching also
uses a public-identity lookup to preserve its coordinate and rsID rules. These
fallbacks and accumulated results still use memory; streaming is not a fixed
ceiling on total browser memory.

Catalogue matching supports **GRCh37 (hg19)** and **GRCh38 (hg38)**. Genomewalk
checks reference names, assembly labels and chromosome lengths in VCF headers,
and build labels in consumer-file comments. Ancestry’s documented export format
supplies the build when its header omits it. If the build still cannot be identified,
the app asks you to choose before matching. A choice is labelled **Selected by you**
and kept only for the current visit. Choose **Another build / I’m not sure** to
explore the file without matching. Conflicting metadata and recognized unsupported
builds also remain available for file exploration only.

Consumer formats are an optional module with format-specific lessons,
independent processing and sessions. Chapter names match the VCF experience.
Consumer matching is
limited to complete, two-letter **autosomal single-base calls on GRCh37 or
GRCh38, on the supported forward strand**. Other calls remain visible in the
file summary. Unknown or contradictory metadata never selects a catalogue by
guesswork. Each consumer ZIP must contain exactly one supported DNA export;
accompanying documentation is ignored when selecting it.

MyHeritage, FamilyTreeDNA and Living DNA exports are not supported yet. Adding
another provider requires a verified format profile and fixtures; accepting a
filename extension alone is insufficient.

The public [HG002 sample](public/samples/README.md) is included for readers who
do not have a file. [Synthetic fixtures](docs/CONSUMER_FILES.md#synthetic-fixtures) are provided
for development; they do not describe a real person.

## Understand the code

Start with [the architecture guide](docs/ARCHITECTURE.md), then read these files:

| Location                            | Responsibility                                                     |
| ----------------------------------- | ------------------------------------------------------------------ |
| `src/routes/`                       | Site shell, landing and policies; chapter-page dispatch            |
| `src/experiences/index.ts`          | File selection and active experience                               |
| `src/experiences/optional.ts`       | Single optional-experience registration                            |
| `src/experiences/vcf/`              | Modular VCF lessons, processing and result rendering               |
| `src/experiences/consumer-dna/`     | Independent consumer reader, pages, processing, tests and fixtures |
| `src/components/`, `src/styles/`    | Site UI, illustrations and styling                                 |
| `src/lib/results/`, `src/lib/view/` | Shared result search, HTML helpers and presentation                |
| `scripts/`                          | Offline reference-data builders                                    |

Maintained logic, pipelines, tests and configuration use TypeScript (`.ts`); React
components use `.tsx`. Node 24 runs the offline scripts and tests directly. Vite
produces ordinary JavaScript for browsers. Component CSS Modules stay beside their
components; shared tokens, layout and lesson styles live in `src/styles/`.
Cross-module integration tests and reusable fixtures live in `tests/`; focused unit
tests stay beside the modules they exercise.

[How to disable or remove consumer support](docs/CONSUMER_FILES.md#removing-the-feature)
requires no redesign of the core VCF chapters. [Contributing](CONTRIBUTING.md)
explains the development and review workflow.

## Evidence and limitations

A software match is a reported allele aligned with a public record, not a
verified medical finding. Missing calls, absent sites, unavailable frequencies
and conflicting records remain distinct. ClinVar stars describe review of the
classification, not the accuracy of a person's genotype. Consumer exports do not
supply sequencing depth or per-call quality, and this importer does not calculate
ethnicity, relatives, haplogroups, imputation or polygenic scores.

Both file experiences use the same reading order: pathogenic or
likely pathogenic classifications with 2–4 ClinVar stars first, the same
classifications with 0–1 stars next, then additional context such as conflicting
classifications, drug responses, associations and traits. Matched records with
incomplete or contradictory file calls appear separately under **Needs verification**.
Group headings and each row's explanation make this ordering visible. Evidence-category
pills remain available, with classification and exact ClinVar star-count filters beside
search. Both filters start at **All**; options with no available results are hidden.
Within the disease groups, review stars precede classification; allele frequency
does not affect the order. This is a reading order, not a personal health-risk
score, and stars describe review rather than disease severity.

For consumer files, a contradictory site with an otherwise eligible catalogue
match is shown only as a verification card with its location, reason and original
rows. It contributes no interpreted variant count, classification, review stars,
copy count or medical associations. Find it in the **Needs verification** section
under **All results**, with both filters set to **All**. Verification cards are excluded
when filtering for a specific classification or star count. Incomplete-only consumer
calls remain in file exploration; the app does not impute missing alleles or turn
them into matches.

The included catalogue keeps selected ClinVar classifications. Benign, likely benign
and uncertain-significance labels do not qualify a record on their own, but an
independent supported label such as drug response retains the record for matching.
The original classifications are preserved. It is not a complete clinical screen.
Indels require exact VCF representation; alternative equivalent representations
can miss. [Reference-data documentation](scripts/README.md),
[evidence rules](scripts/RESULT_EVIDENCE.md) and the
[study source audit](scripts/STUDY_SOURCES.md) explain the choices.

## Rebuild public reference data

With Docker, run the same pipeline in the tools image:

```sh
docker compose run --build --rm tools data:build
```

Use `data:rebuild` for a network-free rebuild from a complete cache, or
`data:refresh` to fetch fresh public inputs. Downloads stay in `data/`; generated
catalogues go to `public/ref/`. Run `docker compose up --build` afterward to
preview the updated site. Reference jobs are separate from the app build.

`npm run data` lists the workflows. The [pipeline guide](scripts/README.md)
documents prerequisites, commands, sources and validation.

## License and data

Genomewalk's source code is [MIT licensed](LICENSE). Dependencies and public
scientific datasets retain their own terms; see
[third-party notices](THIRD_PARTY_NOTICES.md) and the
[data inventory](docs/DATA_AND_PRIVACY.md). Personal exports, build outputs,
download caches and credentials do not belong in the repository.
