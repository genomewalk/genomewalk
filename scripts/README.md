# Offline reference indexes

With Docker, run any target below through the tools service; Node and the UCSC
executable are included:

```sh
docker compose run --build --rm tools data:build
```

Use `data:rebuild` for a network-free rebuild from a complete cache. Use
`data:refresh` to download a new release. Both reuse the host `data/` cache and
write into `public/ref/`; the downloaded inputs are not bundled into images.
Native Node.js commands below remain available.

The browser downloads fixed files from `public/ref/<build>/` and compares them
locally. These builders use public scientific sources; they do not accept a
personal genome as input. Run them from the project root with Node.js 24 LTS.
All entry points are TypeScript executed directly by Node; no separate tool build
or TS runner is required. Shared implementation lives under `scripts/lib/`, and
synthetic pipeline tests live under `tests/integration/`.
Ordinary application development uses the checked-in indexes and needs no rebuild.

## Start here

```sh
npm run data                         # list workflows
npm run data:plan                    # inspect the stages; no writes or requests
npm run data:build                   # build, reuse caches, then validate
npm run data:check                   # validate shipped files without rebuilding
npm run data:inputs                  # inspect cached prerequisites for offline work
```

Use `npm run data:rebuild` for a **network-free** rebuild from an existing cache.
It requires cached ClinVar VCF files, frequencies, citation lists, PubMed labels and compatible
marker API responses. A missing input is an error; it never falls back to HTTP. Before running any
stage, the offline command checks required input files, marker-cache identities
and publication metadata coverage. Run `npm run data:inputs`
to do this check on its own; it writes nothing. The builders still validate
file contents as they stream them, and validate all generated outputs.
Use `npm run data:refresh` when you intend to fetch a new reference release.
`--fresh` and `--offline` cannot be combined.

## Commands

| npm target                               | Purpose                                                                                       | Network               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------- |
| `npm run data:inputs`                    | Check cache prerequisites and marker identities before an offline rebuild                     | No                    |
| `npm run data:plan`                      | Print named stages and exact commands                                                         | No                    |
| `npm run data:rebuild`                   | Rebuild from cached inputs only, then validate                                                | No                    |
| `npm run data:refresh`                   | Fetch fresh inputs and rebuild all indexes                                                    | Yes                   |
| `npm run data:ranges`                    | Build byte-range indexes from existing BGZF catalogues                                        | No                    |
| `npm run data:consumer`                  | Rebuild consumer rsID lookups from existing public assets                                     | No                    |
| `npm run data:build`                     | Download prerequisites, build both references and consumer rsID lookups, validate all outputs | For missing inputs    |
| `npm run data:download`                  | Cache ClinVar VCF/XML; extract germline citation lists                                        | For missing inputs    |
| `npm run data:citations`                 | Download ClinVar VCV XML and extract its germline publication lists                           | For missing input     |
| `npm run data:publications`              | Build compact citation labels for existing catalogues; cache PubMed metadata                  | For missing metadata  |
| `npm run data:frequencies`               | Extract gnomAD v4.1 frequencies for selected ClinVar records                                  | Yes                   |
| `npm run data:catalog -- --build GRCh38` | Build one catalogue from cached inputs                                                        | No                    |
| `npm run data:markers -- --build GRCh38` | Build cited examples from exact variant IDs                                                   | For missing responses |
| `npm run data:check`                     | Validate catalogues, markers and consumer rsID lookups                                        | No                    |
| `npm run test:data`                      | Run synthetic pipeline regression tests                                                       | No                    |

Options follow npm's `--` separator. Each command also accepts `--help`,
`--data-dir <path>` and `--out-dir <path>`. Defaults are the project's `data/`
cache and `public/ref/` output, independent of the caller's working directory.
Explicit paths are relative to the caller's directory.

```sh
npm run data:build -- --dry-run          # print the plan; no writes or requests
npm run data:build -- --only GRCh37      # rebuild just the GRCh37 public files
npm run data:build -- --fresh            # refresh inputs, frequencies and markers
npm run data:frequencies -- --chrom 21 --jobs 4
npm run data:check -- --only GRCh38
```

The first complete run can take an hour or more, mostly remote frequency
extraction. `--chrom 21` performs real network requests and writes
`data/freqs.tsv.chr21`; it never replaces the complete `freqs.tsv` cache.
`--jobs` accepts 1–16 concurrent extractions and defaults to 6. The full
`data:build` / `data:refresh` commands also accept `--jobs` and `--tool`; these are
forwarded to the frequency stage.

Download and marker commands reuse completed cache files. `--fresh` refreshes
those inputs. To refresh the entire pipeline consistently, use
`data:build -- --fresh`, not just an individual download command. A failed
frequency job fails its stage instead of publishing partial results. Completed
stages remain reusable; retry the command after addressing the error.

## Inputs, dependencies and outputs

```text
ClinVar GRCh38 VCF ── gnomAD bigBed regions ── freqs.tsv
        │                                      │
        ├────────── GRCh38 catalogue ───────────┘
        └────────── freqs.by-alleleid.tsv
                              │
ClinVar GRCh37 VCF ── GRCh37 catalogue

ClinVar VCV XML ── aggregate germline citations ── PubMed references in both catalogues
markers.base.json + gnomAD API ── cited markers for each build
```

Each output directory contains `catalog.tsv.gz` (about 26 MB),
`catalog.index.json.gz` (about 5 MB) and `markers.json` (about 6 KB).
The catalogue uses BGZF compression inside a gzip-compatible `.gz` file. The
standard extension prevents GitHub Pages from adding HTTP compression, which
would change the indexed byte offsets.
The compact index contains exact allele keys, row offsets, catalogue summaries and
SHA-256 hashes for each BGZF block. The browser matches keys locally and downloads
only the annotation blocks needed. Catalogue builds generate the index automatically;
`npm run data:ranges` rebuilds indexes from existing catalogues without network access.
Its writer compresses bounded blocks and atomically replaces the destination
after successful processing. Truncated or corrupt input, invalid options and
missing prerequisites cause nonzero exits with an explanation.

GRCh37 frequencies are joined by ClinVar AlleleID to their **GRCh38 gnomAD v4.1
source record**. The original gnomAD coordinate is retained in the catalogue.
A GRCh37-only build still reads the GRCh38 ClinVar input and creates the allele-ID
join, but does not replace the public GRCh38 catalogue. To run the stages by hand:

```sh
npm run data:download
npm run data:frequencies
npm run data:catalog -- --build GRCh38
npm run data:catalog -- --build GRCh37
npm run data:publications
npm run data:markers -- --build GRCh38
npm run data:markers -- --build GRCh37
npm run data:consumer
npm run data:check
```

For a catalogue-only rebuild that leaves shipped files alone:

```sh
npm run data:catalog -- --build GRCh38 --out-dir /tmp/genomewalk-ref
npm run data:catalog -- --build GRCh37 --out-dir /tmp/genomewalk-ref
```

`--out-dir` changes the public output location; the GRCh38 stage still updates
its allele-ID join in `--data-dir`. Use both options when isolating all writes.
There is no deployment or publication step in these commands. Validation is per
artifact; the whole two-build pipeline is not a multi-file atomic transaction.

## ClinVar citation lists

`npm run data:citations` downloads the public VCV XML release (currently about
6 GB compressed) into ignored `data/ClinVarVCVRelease.xml.gz`. A streaming XML
parser reads one variant at a time and writes `data/clinvar.germline-citations.tsv`.
It never writes the much larger uncompressed XML to disk. Subsequent builds reuse
the compact TSV. Catalogue-only builds use the compact caches and do not require the XML.

The importer uses exactly this source path:

```text
VariationArchive/ClassifiedRecord/Classifications/GermlineClassification/Citation/ID[@Source="PubMed"]
```

This is ClinVar's aggregate germline-publication list, the counterpart of the
variant page's germline citations table. IDs are deduplicated within each variant
and joined by VariationID. Citations elsewhere in the XML, including assertion
methods and condition descriptions, are not added. There is no PMID blacklist,
paper-title filtering, or inference from submission comments. If ClinVar places
a methods paper in this aggregate list, it is retained like any other citation.

The XML `ReleaseDate` becomes the catalogue's `citationdate`; it can differ from
the VCF release date and from the live website. Extraction fails on incomplete
XML or invalid IDs and publishes the compact cache only after successful parsing.
`--fresh` refreshes the XML and extraction together. The former broad
`var_citations.txt` cross-reference export is no longer used.

## Compact publication labels

`npm run data:publications` reads the PMIDs in the existing catalogues and fetches
first-author, journal and year metadata from NCBI PubMed ESummary. It emits labels
such as `Brooks et al., PLoS Medicine 2009`. Personal-author initials are omitted;
collective author names are preserved. Long journal names use PubMed's abbreviation.
Paper titles, abstracts and clinical interpretations are not part of this lookup.

The build deduplicates PMIDs across GRCh37 and GRCh38. The ignored cache at
`data/publications.json.gz` records each label (or an explicit missing-metadata
result), its fetch date and the API source. Sequential batches stay below NCBI's
unauthenticated three-requests-per-second limit, retry temporary errors, and
checkpoint after every batch. Re-running an interrupted build fetches only missing
PMIDs. A failed response never becomes a cached missing-paper result.

```sh
npm run data:publications             # fetch missing metadata and publish labels
npm run data:publications -- --offline # regenerate from cache, with no requests
npm run data:publications -- --fresh   # refresh every referenced PMID
```

The output is `public/ref/publications/index.json` plus 64 compressed shards,
partitioned by PMID modulo 64. Each shard filename contains its SHA-256. Both
results views enhance the visible page's PMID links after rendering, fetching only
the required shards with four concurrent requests at most. Failed or missing
metadata leaves the existing PMID links usable. No live PubMed request is made
from the browser. Three publications are displayed, followed by an
“All N on ClinVar” link when there are more. The count uses the imported list of
distinct PubMed IDs. The results layout stays
the same, as do variant matching and catalogue byte-range indexes.

`data:build`, `data:refresh` and `data:rebuild` include this stage after catalogue
generation. `data:inputs` and offline builds verify that incoming ClinVar references
have cached metadata before output is written. `data:check` verifies shard hashes
and coverage of every catalogue PMID. With `--only`, labels still cover any other
build already present in the output folder, because this lookup is shared.

The manifest is published last and old content-addressed shards are retained so
an interrupted refresh cannot invalidate the previous manifest. Deploy the manifest
and its shards together. See [deployment requirements](../docs/DEPLOYMENT.md).

## Selection and frequency policy

`lib/clinvar.ts` owns the selection used by **both** the catalogue and frequency
builders. It retains selected pathogenic, likely pathogenic, conflicting,
drug-response, risk, association, protective and Affects records. Benign and
uncertain-significance entries are excluded to bound this teaching catalogue.
This selection is not a comprehensive clinical screen. Only single alternate
sequence alleles up to 50 bases are included; symbolic and multiallelic rows are
not guessed into individual alleles.

The earlier frequency script searched for `pathogenic` anywhere in INFO and
could miss other retained categories. Fresh frequency builds now use the shared
selection. Existing caches remain readable; missing frequency stays unknown
until rebuilt. This cleanup does not refresh the shipped scientific data.

The frequency extractor clusters nearby targets, streams UCSC bigBed rows and
keeps the exome or genome observation with the greater allele number (AN).
Genomes win equal-AN ties deterministically. These datasets are not added
together. Overall AF and the highest population AF remain separate. Zero is a
measured value; unavailable population data remains missing. Frequency does not
automatically dismiss a ClinVar claim.

`bigBedToBed` is the only external executable. It is downloaded from UCSC into
`data/tools/` for macOS arm64/x64 or Linux x64. Other platforms can supply a
compatible executable with `data:frequencies -- --tool <path>`. Downloads use
Node's HTTP client; curl, bgzip, tabix and Python are not build prerequisites.
Each extraction has a two-minute timeout and up to three attempts.

## Cited examples

`markers.base.json` stores the curated wording and citations. A cited marker
must also have a `targets` entry for each supported build:

```json
{
  "GRCh38": { "variant": "12-111803962-G-A", "effectAllele": "A" },
  "GRCh37": { "variant": "12-112241766-G-A", "effectAllele": "A" }
}
```

These are exact forward-strand source alleles, not inferred parental alleles.
The current targets preserve the identities in the already-shipped marker files.
The builder requests that exact variant and checks the returned identity. It
never chooses an arbitrary rsID alternative or guesses strand from the effect
letter. Genome frequencies are preferred when available, otherwise exomes.
Raw API responses are cached under `data/markers/` with dataset and fetch time;
`--fresh` replaces them. The browser still receives only the small final index.

Candidates without cited interpretations stay excluded. When adding an example,
verify variant, build, effect allele, study population and wording. `cite` may
contain several sources, and `studyNote` records qualifications. See
[STUDY_SOURCES.md](STUDY_SOURCES.md) and [RESULT_EVIDENCE.md](RESULT_EVIDENCE.md).

## Code map

The scripts at this directory's root are small CLI entry points. Shared code is
in `lib/`:

| Module                                      | Responsibility                                                 |
| ------------------------------------------- | -------------------------------------------------------------- |
| `preflight.ts`                              | Read-only prerequisite checks for cached rebuilds              |
| `config.ts`, `cli.ts`                       | Source URLs, paths, strict options and help                    |
| `plan.ts`                                   | Ordered prerequisites and single-build behavior                |
| `downloads.ts`, `network.ts`, `tool.ts`     | Public input downloads, HTTP retry and the UCSC executable     |
| `io/atomic.ts`, `io/lines.ts`, `io/bgzf.ts` | Atomic files, streaming lines and bounded BGZF reading/writing |
| `util.ts`, `log.ts`                         | Small compatibility API and progress logging                   |
| `clinvar.ts`, `catalog.ts`                  | Shared record selection, evidence fields and joins             |
| `frequencies.ts`                            | Regions, bounded extraction jobs and dataset selection         |
| `markers.ts`                                | Exact marker identities, cached requests and output            |
| `validate.ts`                               | Schema, frequency, identity and evidence checks                |

`reference-data.test.ts` exercises synthetic builds, corrupt inputs, failed
requests, cross-build joins, marker mismatches and write preservation. It is also
included in `npm test` and `npm run check`. `data:check` reads the actual public
files separately and makes no network requests.

## Sources and cache

- [ClinVar GRCh38](https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/) and
  [GRCh37](https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh37/)
- [ClinVar VCV XML release](https://ftp.ncbi.nlm.nih.gov/pub/clinvar/xml/ClinVarVCVRelease_00-latest.xml.gz)
- [UCSC gnomAD v4.1 bigBeds](https://hgdownload.soe.ucsc.edu/gbdb/hg38/gnomAD/v4.1/)
- [gnomAD API](https://gnomad.broadinstitute.org/api)
- [UCSC executables](https://hgdownload.soe.ucsc.edu/admin/exe/)

`data/` contains downloaded public inputs, intermediate joins and tool caches.
It is ignored by Git and can be recreated. Keep public sample provenance and
upstream data terms when distributing `public/ref/`; the source-code MIT license
does not relicense these datasets. Source release and citation dates remain in
the catalogue even though the result UI omits those technical dates.

## Runtime independence

The builders keep file and BGZF utilities in `scripts/lib/io/`, using Node's
native CRC32 checksum. Condition-link and citation utilities live in
`scripts/lib/reference/`. They import neither browser experience. Removing the
consumer experience therefore does not affect the remaining reference stages.

## Consumer rsID lookups

`npm run data:build` also runs the modular
`scripts/build-consumer.ts` stage **after** the existing catalogues and markers.
Use `npm run data:consumer` to run that stage on its own. `--only GRCh37` and `--only GRCh38`
apply to this stage too. `data:check` validates every output, including these
sidecars. `npm test` includes consumer builder and matcher regression tests.

The stage reads existing public files and writes only:

```text
public/ref/consumer-dna/GRCh37/rsids.json.gz
public/ref/consumer-dna/GRCh38/rsids.json.gz
```

Each sidecar contains all rsID-to-single-base-candidate mappings for the compact
ClinVar catalogue and curated gnomAD examples. Values point to existing
`chrom:pos:ref:alt` records; classifications and frequencies are not duplicated.
The catalogue's existing GRCh38 gnomAD source key remains attached to its exact
allele, including GRCh37 records joined by ClinVar AlleleID. This does not add
coverage beyond the existing catalogue or five cited markers.

Consumer matching selects candidates by build, chromosome and position, then
checks reported alleles. These sidecars supply an additional rsID location check;
they do not limit the alleles selected at a consistent position. Known identifier
disagreements are shown separately for review and excluded from interpretation.

SHA-256 hashes bind each sidecar to the exact catalogue and marker bytes.
Both offline validation and browser loading reject mismatched releases. Rebuild
the sidecars after a standalone catalogue or marker rebuild; do not mix assets
from different runs. The existing WGS file formats and matching code are unchanged.

To rebuild just these sidecars from already generated public assets, without
network access: `npm run data:consumer`. Add `-- --check` to validate
without writing. Common `--data-dir`, `--out-dir`, and `--only` options work here.

### Retired/merged identifiers

No merge is inferred from shared coordinates or shared alleles. By default,
only the identifiers supplied by the existing catalogues are indexed. An optional
`data/consumer-rsid-aliases.json` can supply a reviewed public dbSNP merge map:

```json
{
  "source": "URL of the public merge source",
  "release": "source release identifier",
  "aliases": { "rsOLD": "rsCURRENT" }
}
```

Replace the illustrative IDs with actual numeric rsIDs from the named source.
The builder resolves chains, rejects cycles and collisions with direct IDs,
and retains only aliases leading to indexed records. It records the input's
hash and provenance. The shipped sidecars currently contain **no additional
retired-ID aliases**; a full dbSNP merge-history download is not part of the
normal build. Unknown IDs use the same exact-coordinate lookup, but
are not represented as verified rsID matches.

Removing `scripts/consumer/` makes the full pipeline and validator skip this
optional stage automatically. Delete `public/ref/consumer-dna/` alongside it.
