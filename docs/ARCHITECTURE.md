# Architecture

Genomewalk has VCF and consumer file experiences. React owns routes, file
selection and the page shell. The selected experience owns its session, lessons,
counting rules and matching policy. Personal file bytes and derived results stay
in memory. Genome matching fetches fixed public reference assets from the static
host. Fonts and production analytics make separate requests described in the
[data and privacy inventory](DATA_AND_PRIVACY.md).

## Source layout and conventions

```text
src/
  routes/                 # TanStack routes: metadata and page composition
  components/
    landing/              # Home UI, its CSS Module and lazy graphics
    genome-explorer/      # Explorer UI, geometry, CSS Module and graphics
    chapter-background/   # Shared chapter decoration and CSS Module
    policy-page/          # Policy layout and CSS Module
    diagrams/             # Shared educational renderers
  experiences/
    vcf/                  # VCF reader, session, chapters and evidence rules
    consumer-dna/         # Optional, independently removable experience
    shared/               # Shared lesson contracts and renderers
  lib/
    io/                   # Local/BGZF readers, checksums and HTTP ranges
    async/                # Cooperative scheduling and shared scans
    catalogues/           # Reference contracts, metadata and catalogue streaming
    genetics/             # Shared frequency calculations and presentation data
    intake/               # File selection and progress
    navigation/           # Chapter navigation
    results/              # Search, filtering, pagination and source links
    view/                 # Small HTML and population-figure helpers
  styles/                 # Global tokens, shared layout and lesson styles
scripts/
  *.ts                    # Runnable offline/build/check entry points
  lib/                    # Pipeline stages, I/O, validation and CLI contracts
  consumer/               # Optional consumer sidecar builder
tests/
  integration/            # Tests crossing module boundaries
  helpers/                # Typed DOM stubs and synthetic BGZF builders
  fixtures/               # Reviewed presentation and evidence snapshots
```

Use `.ts` for maintained logic, scripts, tests and configuration, and `.tsx` for
React components. A focused `*.test.ts` belongs beside its module; tests that
exercise a complete workflow belong in `tests/integration/`. Put a new helper
under the responsibility it serves, rather than adding another general utilities
folder. Keep routes thin and parsing independent of rendering.

Relative imports include their `.ts` or `.tsx` extension so Node 24 can run tools
and tests without a transpilation runner. Use `import type` for contracts that
have no runtime dependency. `types.ts` files describe real module boundaries;
prefer inference inside a function. External JSON still needs runtime validation:
TypeScript annotations do not validate downloaded data.

`tsconfig.base.json` holds strict checks shared by all code. `tsconfig.json`
checks the browser application; `tsconfig.tools.json` checks Node scripts and
configuration; `tsconfig.tests.json` checks tests and their fixtures. `npm run typecheck` runs all three. Offline commands use Node's native type stripping;
`erasableSyntaxOnly` prevents syntax that would need a separate compiler. Vite
compiles the application to browser JavaScript. Generated bundles and installed
dependencies are not maintained TypeScript source.

## Follow the data

```text
Local file chooser → use-genome-intake → experiences/index.ts
  ├─ vcf/index.ts          → BGZF blocks → VCF rows → VCF scans/matches
  └─ consumer-dna/index.ts → TXT/ZIP/gzip → provider calls → consumer scans/matches

Compact public metadata + streamed catalogue
  → local genome/catalogue matching → retained result evidence → result HTML
```

The consumer experience never imports VCF processing. Both may use neutral
infrastructure in `src/lib/`: BGZF decoding, scheduling, catalogue streaming and
shared contracts. Educational diagrams live in `src/components/diagrams/`. Neither runtime imports `scripts/`. The offline
builders retain their own readers, so removing either browser experience does
not break data production.

## Module map

| Area                                       | Responsibility                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `src/routes/`                              | Route metadata and page composition                                    |
| `src/lib/intake/use-genome-intake.ts`      | File selection, cancellation, progress and navigation                  |
| `src/lib/catalogues/public-sample.ts`      | Download the fixed public HG002 sample                                 |
| `src/experiences/index.ts`, `selection.ts` | Select an experience; retain a file handle through development updates |
| `src/experiences/*/chapter-page.tsx`       | Run chapters and retain completed output for the current visit         |
| `src/components/results-panel.tsx`         | Shared loading, cancellation, retry and cached output UI               |
| `src/experiences/*/results-panel.tsx`      | Connect the shared panel to each independent engine/session            |
| `src/experiences/*/engine/context.ts`      | Active file and derived state; reset on selection                      |
| `src/experiences/*/engine/learn.ts`        | Small ordered chapter registry                                         |
| `src/experiences/*/engine/chapters/`       | One lesson per module                                                  |
| `src/experiences/*/engine/statistics.ts`   | Full-file counts, separate from presentation                           |
| `src/experiences/*/engine/matching.ts`     | Match reported alleles to catalogue entries                            |
| `src/lib/results/evidence.ts`              | Shared evidence categories and interpretation rules                    |
| `src/experiences/*/engine/view/`           | HTML rendering; no file parsing                                        |
| `src/components/*/graphics/`               | Lazy-loaded Three.js rendering and resource cleanup                    |
| `src/lib/results/`                         | Result filtering, suggestions, pagination and source links             |
| `src/lib/view/`                            | Neutral HTML, condition labels and population figures                  |
| `src/styles/`                              | Shared presentation; consumer-specific styles stay in its folder       |

### VCF

`engine/learn.ts` preserves the `STEPS`, `ctx`, `FileSource` and `detectBuild`
entry points. Its chapter definitions live in `engine/chapters/`.
`runtime.ts` coordinates cached scans; `statistics.ts` performs counting;
`sampling.ts` handles bounded examples. `reference.ts` identifies the build and
`identity.ts` constructs exact allele keys. `catalogue.ts` and `markers.ts` load
public references. `view/result-list.ts` owns search/pagination, while
`view/results.ts` renders individual results. Both result-list adapters supply
format-specific identifiers and evidence categories to `src/lib/results/list.ts`.
`search.ts` indexes text, suggestions and categories once; subsequent searches
filter that index without recomputing scientific classifications.

`vcf.ts` reads UTF-8 lines through `src/lib/io/bgzf-lines.ts`. The shared BGZF reader
checks block sizes, CRC and truncation before delivering decoded blocks. The
line reader preserves CRLF, split UTF-8 characters and final lines without a
newline. Cooperative scheduling releases its MessageChannel after each yield.

Counting is shared between chapters 4 and 5. A file change cancels pending work
and prevents an earlier file's header/counts from entering the replacement
session. Chapter 3 samples at most 50,000 rows and does not replace full counts.
The VCF matcher still requires exact REF/ALT representation: it does not
normalize equivalent indels, impute alleles or translate consumer I/D codes.

### Consumer DNA

`reader.ts` opens supported files and streams rows. `reader/header.ts` recognizes
provider metadata; `reader/call.ts` decodes individual calls. Compression lives
in `containers.ts`, and counting in `engine/statistics.ts`. `chapters.ts` is a
small dispatcher for the first six lessons; frequency, ClinVar and result lessons
have their own modules.

Matching remains limited to complete, diploid, forward-strand autosomal
single-base calls on GRCh37 or GRCh38. Coordinates select candidate entries;
literal alleles determine a match. The separate rsID sidecar cross-checks known
identifiers against coordinates, without rejecting missing or unindexed IDs.
Conflicting repeated calls remain separate from interpreted results.

The sidecars are bound to catalogue and marker bytes by SHA-256. A release with
mismatched files is rejected. See [CONSUMER_FILES.md](CONSUMER_FILES.md) for format
limits and optional-feature removal.

## Catalogue memory and rendering

Each build publishes a BGZF `catalog.tsv.gz` and a plain `catalog.meta.json`
summary of about 3.7 KB. The summary contains the header, counts, chromosome order,
a few public examples, compressed-file size and SHA-256. It contains no complete
key list or block/row locators. Teaching chapters use this small summary without
reading a genome or downloading the complete catalogue.

The sorted VCF path streams the catalogue through one ordinary GET and reads the
local genome progressively. At each shared chromosome/position it compares exact
REF/ALT alleles, preserves the existing genotype, quality and duplicate-call
rules, and retains results. Passed rows and decoded blocks are released. The two
streams must follow the catalogue's chromosome order and nondecreasing positions;
all alleles at a position are considered together. Rows crossing BGZF boundaries
are reassembled before parsing.

An input-order violation discards the incomplete merge result and restarts through
a compatibility path: stream the catalogue to retain compact public identities,
scan the input for matching calls, then stream the catalogue again for their
payloads. Consumer matching uses this two-pass identity/payload strategy because
provider exports need not follow catalogue order. It also retains its source-bound
rsID sidecar; missing or unindexed rsIDs still permit the existing exact-coordinate
fallback. Additional GETs may be served by the browser's HTTP cache, but caching is
not required for correctness.

Catalogue response bodies are streamed rather than materialized with
`arrayBuffer()`. The existing `fflate` decoder processes bounded BGZF blocks and
checks CRC/decoded size; `@noble/hashes` computes SHA-256 incrementally over the
compressed stream. Successful results are committed only after the complete
catalogue matches its published length and digest. Aborts and failed downloads
release the reader; partial results do not enter the active session.

This bounds the sorted join's working buffers, not the whole application's RAM.
The current locus, long unfinished lines, accumulated results, UI state and other
scans still consume memory. Compatibility paths retain compact public identities;
consumer compressed exports also retain decoded input text. No complete catalogue
payload map or complete personal variant-key set is built for the sorted join.
Completed results and the small metadata summary can be reused without rereading
the catalogue when revisiting the results view.

`src/lib/io/http-range.ts` remains necessary for the public HG002 sample. It
requires correct HTTP 206 responses and unchanged byte ranges, reading just the
sample header initially. Full-genome chapters scan its bytes in bounded ranges.
Personal files use the local File API; catalogue downloads do not send Range
headers. Both paths require the stored compressed bytes to remain unchanged.

The offline builder creates the compact metadata automatically and validates
contiguous chromosome sections, nondecreasing positions and unique variant keys.
`data:metadata` rebuilds summaries from existing catalogues. A separate development
check verifies the production matcher's results against a simple local reference
lookup; see [matching correctness](BENCHMARKS.md).

`scripts/lib/reference/clinvar-citations.ts` streams the offline ClinVar VCV XML
release into a compact, dated VariationID-to-PMID table. It reads only the aggregate
germline-classification citations, matching the scope of ClinVar's citation table.
The `saxes` parser is a build-time dependency and does not enter the browser bundle.

Publication labels are separate from matching. `scripts/lib/publications.ts` joins
catalogue PMIDs to cached PubMed metadata and produces a shared manifest and 64
content-addressed shards. `src/lib/catalogues/publications.ts` validates and caches
only requested shards; `src/lib/results/publication-links.ts` enhances links after
each result-list render. Both file formats use this presentation module. Metadata
failures preserve PMID links and cannot block or change genome results.

The default Vite build prerenders all routes into `dist/client/`. That directory is
the entire deployable site; `dist/server/` is used only during prerendering. The
file-only preview server implements directory indexes and HTTP Range responses.

## Graphics and styles

`genome-scene.tsx` and `landing-molecule.tsx` own React lifecycle and fallbacks.
Their graphics modules load asynchronously, allocate the scene, and return a
cleanup function for observers, animation frames, GPU buffers and listeners.
`genome-model.ts` owns geometry/position calculations shared with annotations.

Component styles stay next to their component as `*.module.css`. Policy and
background classes are local. The landing and explorer modules scope their root
while retaining named child hooks shared by the graphics, annotations and landing
theme. `:global(...)` makes those hooks explicit; the explorer uses `:where(...)`
for its scope boundary so selector specificity remains unchanged. New private
component classes should be local. Shared string-rendered lessons deliberately
keep their global class names.

CSS cascade order in `src/styles.css` is deliberate. Typography roles come from
`styles/theme.css`, and collapsible cards from `styles/collapsible-cards.css`.
`styles/lessons.css` is an ordered import list for the focused base styles under
`styles/lessons/`: primitives, genotypes, results, markers, catalogues, chromosomes,
population figures, lookup diagrams and tables. Keep their import order: later
files in `styles.css` intentionally refine these base rules. Presentation snapshots
protect the reviewed styles and lesson templates. Obsolete landing and diagram
selectors are removed instead of accumulating more overrides.

## Tests and offline tools

Tests import the real engine modules. Synthetic BGZF fixtures exercise the actual
parser, matching and chapter lifecycle; they do not strip imports or evaluate a
monolithic source string. Style snapshots remove only module scope markers; lesson snapshots examine
runtime strings, excluding type annotations and property-access spelling. These
fixtures guard the existing
presentation. Behavior tests cover evidence, cancellation, repeated records,
reference identity, and missing values. See [VALIDATION.md](VALIDATION.md).

The offline entry points delegate to `scripts/lib/`. `plan.ts` describes ordered
stages, `cli.ts` validates options, and separate modules own downloads, file I/O,
ClinVar selection, frequency extraction, joins, markers and validation.
Independent pipe-separated ClinVar classifications are evaluated separately, so
benign or uncertain labels do not discard a separate supported drug-response,
risk, association or trait label. Both genome experiences use the rebuilt catalogue;
the complete original labels remain available in their results.
Frequency extraction revisits current targets on each reference build and reuses
only region caches whose exact allele keys match. Selection changes therefore
propagate to frequencies, catalogues, compact metadata and consumer rsID sidecars.
`preflight.ts` checks offline prerequisites before any stage writes files.
Each public command has one entry point; `build-consumer.ts` handles the optional
consumer sidecar and skips it when that module is absent. Start
with `npm run data`; see [scripts/README.md](../scripts/README.md) for runnable targets.

`vite.config.ts` prerenders the static deployment. There are no genome-processing
server routes. Building or checking the project does not deploy it.
