# Offline reference data

With Docker, run any target below through the tools service; Node and the indexed-file reader
are included:

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
Ordinary application development uses the checked-in public assets and needs no rebuild.

## Start here

```sh
npm run data                         # list workflows
npm run data:plan                    # inspect the stages; no writes or requests
npm run data:build                   # build, reuse caches, then validate
npm run data:check                   # validate shipped files without rebuilding
npm run data:inputs                  # inspect cached prerequisites for offline work
```

Use `npm run data:rebuild` for a **network-free** rebuild from an existing cache.
It requires cached ClinVar VCF files, frequency regions for the current selected
alleles, citation lists, PubMed labels and compatible marker frequency records.
A missing input is an error; it never falls back to HTTP. Before running any
stage, the offline command checks required input files, frequency-region identities,
marker-cache identities and publication metadata coverage. Run `npm run data:inputs`
to do this check on its own; it writes nothing. The builders still validate
file contents as they stream them, and validate all generated outputs.
Use `npm run data:refresh` when you intend to fetch a new reference release.
`--fresh` and `--offline` cannot be combined.

## Commands

| npm target                               | Purpose                                                                                       | Network                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `npm run data:inputs`                    | Check cache prerequisites and marker identities before an offline rebuild                     | No                                         |
| `npm run data:plan`                      | Print named stages and exact commands                                                         | No                                         |
| `npm run data:rebuild`                   | Rebuild from cached inputs only, then validate                                                | No                                         |
| `npm run data:refresh`                   | Fetch fresh inputs and rebuild all public assets                                              | Yes                                        |
| `npm run data:metadata`                  | Build compact metadata from existing BGZF catalogues                                          | No                                         |
| `npm run data:consumer`                  | Rebuild consumer rsID lookups from existing public assets                                     | No                                         |
| `npm run data:build`                     | Download prerequisites, build both references and consumer rsID lookups, validate all outputs | For missing inputs                         |
| `npm run data:download`                  | Cache ClinVar VCF/XML; extract germline citation lists                                        | For missing inputs                         |
| `npm run data:citations`                 | Download ClinVar VCV XML and extract its germline publication lists                           | For missing input                          |
| `npm run data:publications`              | Build compact citation labels for existing catalogues; cache PubMed metadata                  | For missing metadata                       |
| `npm run data:frequencies`               | Extract published gnomAD v4.1 combined frequencies for selected ClinVar records               | For missing regions; none with `--offline` |
| `npm run data:catalog -- --build GRCh38` | Build one catalogue from cached inputs                                                        | No                                         |
| `npm run data:markers -- --build GRCh38` | Build cited examples from exact variant IDs                                                   | For missing responses                      |
| `npm run data:check`                     | Validate catalogues, metadata, markers and consumer rsID lookups                              | No                                         |
| `npm run test:data`                      | Run synthetic pipeline regression tests                                                       | No                                         |

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

The first complete run is dominated by remote frequency extraction. `--chrom 21` performs real network requests and writes
`data/freqs.gnomad-v4.1-joint.tsv.chr21`; it never replaces the complete joint-frequency cache.
`--jobs` accepts 1–16 concurrent extractions and defaults to 3. The full
`data:build` / `data:refresh` commands also accept `--jobs`. Extraction uses
standard Tabix indexes and HTTP byte ranges to read the official joint VCFs.
The first extraction can take many hours: the source rows contain considerably
more information than the small published Genomewalk catalogue. Completed regions
are cached under `data/gnomad-v4.1-joint/`; rerunning resumes those results.
Every `data:build` run revisits the selected targets and assembles the frequency
TSV from these region caches, even when a previous TSV exists. Cache identities
include the exact selected allele keys, so a selection change retrieves only
new or changed regions rather than silently reusing incomplete frequency coverage.
`data:frequencies -- --offline` and `data:rebuild` require those exact caches;
missing regions fail before the existing frequency TSV is replaced.
`--fresh` deliberately bypasses this cache. Neither the full VCFs nor these
intermediate caches are shipped to the browser.

Download and marker commands reuse completed cache files. `--fresh` refreshes
those inputs. To refresh the entire pipeline consistently, use
`data:build -- --fresh`, not just an individual download command. A failed
frequency job fails its stage instead of publishing partial results. Completed
stages remain reusable; retry the command after addressing the error.

## Inputs, dependencies and outputs

```text
ClinVar GRCh38 VCF ── gnomAD joint VCF regions ── joint frequency cache
        │                                      │
        ├────────── GRCh38 catalogue ───────────┘
        └────────── freqs.gnomad-v4.1-joint.by-alleleid.tsv
                              │
ClinVar GRCh37 VCF ── GRCh37 catalogue

ClinVar VCV XML ── aggregate germline citations ── PubMed references in both catalogues
markers.base.json + GRCh38 joint VCF ── cited markers for each build
```

Each output directory contains `catalog.tsv.gz`, `catalog.meta.json` and
`markers.json` (about 6 KB). After retaining mixed classifications and joining
gnomAD frequencies and ClinVar citations, the current files from the cached
2026-09-05 ClinVar release are:

| Build  | Records | Catalogue (compressed MB) | Metadata (bytes) |
| ------ | ------: | ------------------------: | ---------------: |
| GRCh38 | 511,286 |                    28.061 |            3,749 |
| GRCh37 | 511,282 |                    26.883 |            3,753 |

MB is decimal (1,000,000 bytes). The uncompressed catalogue text is 165.174 MB
for GRCh38 and 160.833 MB for GRCh37; this is not a measurement of browser memory.
The browser uses only the selected build. Sorted VCF matching streams its complete
catalogue through one GET, compares it progressively with the genome, keeps
matches and releases processed blocks. It does not retain a complete catalogue
payload map or personal variant-key set. Unsorted VCFs restart with a compact
public-identity lookup and additional passes. Consumer matching uses two catalogue
passes for identities and matching payloads, plus a compressed rsID lookup of
about 2.609 MB. HTTP caching can reduce repeat transfer but is not required.
Publication labels, teaching markers and application assets are separate.

The catalogue uses BGZF compression inside a gzip-compatible `.gz` file. Serve
its original bytes without HTTP content transformations. Metadata holds the
compressed-file SHA-256 and size, chromosome order, record/class/star counts,
header, six sample rows and three curated teaching examples. It contains no
complete allele-key index or block/row locators. Catalogue builds generate this
summary automatically; `npm run data:metadata` regenerates it without network
access. The browser verifies the complete stream's byte length and SHA-256 before
accepting matching results, in addition to per-block CRC and decoded-size checks.

The writer compresses bounded blocks and atomically replaces its destination
after successful processing. Catalogue rows must have contiguous chromosome
sections, nondecreasing positions within each section and unique exact allele
keys. The builder checks these before committing generated catalogue data; the
metadata validator checks them again against the published file. Truncated or
corrupt input, invalid options and missing prerequisites fail explicitly.

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
After changing selection rules, use `data:build` to update frequency coverage,
both catalogues and compact metadata, publication labels and consumer rsID sidecars
together. A standalone catalogue build does not populate missing gnomAD lookups.

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
the same, as does the evidence used for variant matching.

`data:build`, `data:refresh` and `data:rebuild` include this stage after catalogue
generation. `data:inputs` and offline builds verify that incoming ClinVar references
have cached metadata before output is written. `data:check` verifies shard hashes
and coverage of every catalogue PMID. With `--only`, labels still cover any other
build already present in the output folder, because this lookup is shared.

The manifest is published last and old content-addressed shards are retained so
an interrupted refresh cannot invalidate the previous manifest. Deploy the manifest
and its shards together. See [deployment requirements](../docs/DEPLOYMENT.md).

## Matching correctness

`npm run benchmark` checks the production VCF matcher using the bundled public
HG002 sample and a simple local reference lookup. Every result field and result
ordering must agree. The optional `giab-grch38` suite checks seven public inputs.
See [BENCHMARKS.md](../docs/BENCHMARKS.md) for inputs, reports and the manual GitHub
workflow. This command checks correctness only; it does not compare download
methods or measure speed, memory or transfer volume.

## Selection and frequency policy

`lib/clinvar.ts` owns the selection used by **both** the catalogue and frequency
builders. It retains selected pathogenic, likely pathogenic, conflicting,
drug-response, risk, association, protective and Affects records. Benign and
uncertain-significance labels do not qualify a record on their own. Independent
pipe-separated classifications are considered separately: `Benign|drug_response`
and `Uncertain_significance|drug_response` are retained, along with mixed records
carrying other supported labels. The original `CLNSIG` text is preserved. Conflicting
and pathogenic classifications retain precedence; other supported records use code
`O`. A standalone `Uncertain_risk_allele` remains excluded.
This selection is not a comprehensive clinical screen. Only single alternate
sequence alleles up to 50 bases are included; symbolic and multiallelic rows are
not guessed into individual alleles.

The extractor matches chromosome, position, REF and ALT in the official GRCh38
gnomAD v4.1 joint sites VCFs. It retains published `AF_joint`, `AC_joint`,
`AN_joint`, `grpmax_joint`, `AF_grpmax_joint`, the VCF `FILTER` status and
`stat_union_p_value`. It does not choose between exomes and genomes, average their
percentages, or substitute filtering allele frequency (`faf95`) for observed AF.
Zero is a measured value; missing data remains missing. Source filter warnings
and gnomAD's discordance threshold (`p < 0.0001`) are explained in both results
views. These annotations do not automatically dismiss a ClinVar claim.

`@gmod/tabix` is an offline development dependency; no external executable is
needed. Nearby targets share 16,384-base queries. Failed region reads get up to
six attempts, with increasing pauses of 5–25 seconds between attempts,
and the complete frequency cache is published only after all regions succeed.
The joint cache has a separate filename and expanded schema, so an old
exome/genome-selection cache cannot silently be reused as joint data.

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
The builder reads the exact GRCh38 variant from the same published joint VCFs
used for catalogue annotations. Both builds use these frequencies; the curated
GRCh37 target supplies the display/matching coordinate. The builder checks that
REF, ALT and the effect allele agree across the curated targets and refuses
unverified allele changes. This small curated map is separate from the catalogue's
ClinVar AlleleID join. Population figures use `AF_joint_<group>` when that group's
`AN_joint_<group>` is positive. No rounding is applied to the saved frequencies.

Completed marker records are cached under `data/markers/gnomad-v4.1-joint-rs*.json`.
`--fresh` refreshes them; `--offline` requires a compatible cache. The browser
receives only the compact marker index and links back to its GRCh38 source.
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
| `downloads.ts`, `network.ts`                | Public input downloads and HTTP retry                          |
| `io/atomic.ts`, `io/lines.ts`, `io/bgzf.ts` | Atomic files, streaming lines and bounded BGZF reading/writing |
| `util.ts`, `log.ts`                         | Small compatibility API and progress logging                   |
| `clinvar.ts`, `catalog.ts`                  | Shared record selection, evidence fields and joins             |
| `catalog-metadata.ts`                       | Compact summaries, sorted-order checks and catalogue digests   |
| `frequencies.ts`                            | Resumable regions and bounded extraction jobs                  |
| `markers.ts`                                | Verified cross-build marker identities and cached output       |
| `validate.ts`                               | Schema, frequency, identity and evidence checks                |

`reference-data.test.ts` exercises synthetic builds, corrupt inputs, failed
requests, cross-build joins, marker mismatches and write preservation. It is also
included in `npm test` and `npm run check`. `data:check` reads the actual public
files separately and makes no network requests.

## Sources and cache

- [ClinVar GRCh38](https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/) and
  [GRCh37](https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh37/)
- [ClinVar VCV XML release](https://ftp.ncbi.nlm.nih.gov/pub/clinvar/xml/ClinVarVCVRelease_00-latest.xml.gz)
- [gnomAD v4.1 combined frequencies](https://gnomad.broadinstitute.org/news/2024-04-gnomad-v4-1)
- [Official joint VCF directory](https://storage.googleapis.com/storage/v1/b/gcp-public-data--gnomad/o?prefix=release/4.1/vcf/joint/)
- [Tabix reader](https://github.com/GMOD/tabix-js)

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

Consumer matching first streams public single-base identities from the catalogue,
selects candidates by build, chromosome and position, then checks reported alleles.
A second catalogue pass retains evidence only for matched records. These sidecars
supply an additional rsID location check;
they do not limit the alleles selected at a consistent position. Known identifier
disagreements are shown separately for review and excluded from interpretation.

SHA-256 hashes bind each sidecar to the exact catalogue and marker bytes.
Both offline validation and browser loading reject mismatched releases. Rebuild
the sidecars after a standalone catalogue or marker rebuild; do not mix assets
from different runs. Both file experiences use the same published catalogue;
consumer interpretation and its rsID checks remain separate from VCF genotype rules.

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
