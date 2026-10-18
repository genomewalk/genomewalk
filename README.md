# Genomewalk

An educational field guide to a DNA data file. Open a file in your browser,
explore the chapters in any order, or go straight to **Your results**.
Personal DNA files are read locally. The browser downloads public indexes, matches
locally, then fetches only the catalogue blocks needed for the annotations.
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
```

After moving source modules or changing dependencies, stop the running dev server
with Ctrl+C and restart it with `npm run dev -- --force`. Reload the page and
select the file again. Use the URL printed by that server; an older process on a
different port can keep serving stale modules. Keep one dev server per checkout.

The application uses React, TanStack Start, Vite and Three.js. **The deployable site
is entirely static:** `npm run build` prerenders the pages into **`dist/client/`**,
and `npm run preview` serves that folder at `http://localhost:5283`.
GitHub Pages publishes it at `genomewalk.com`. See the
[deployment guide](docs/DEPLOYMENT.md) for hosting, byte-range requirements,
domain setup and the deployment and reference-data workflows.

## Supported files

| File                                               | What Genomewalk reads                                              |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| BGZF-compressed VCF / gVCF (`.vcf.gz`, `.vcf.bgz`) | Header, first sample, literal alleles and available quality fields |
| 23andMe raw TXT, ZIP or gzip                       | Four-column genotype export with its original header               |
| AncestryDNA raw TXT, ZIP or gzip                   | Five-column allele export with its original header                 |

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
guesswork. Consumer archives are limited to one text payload and 128 MiB; scans
accept at most two million rows.

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

The included catalogue keeps selected ClinVar classifications and excludes benign
and uncertain-significance records. It is not a complete clinical screen.
Indels require exact VCF representation; alternative equivalent representations
can miss. [Reference-data documentation](scripts/README.md),
[evidence rules](scripts/RESULT_EVIDENCE.md) and the
[study source audit](scripts/STUDY_SOURCES.md) explain the choices.

## Rebuild public reference indexes

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
