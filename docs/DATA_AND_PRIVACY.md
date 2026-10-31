# Data inventory and network behavior

This is an engineering inventory for maintainers. The site's Privacy Policy and
Terms remain in `src/content/policies.tsx`.

| Location                                   | Contents                                                                   | Release treatment                                             |
| ------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/`, `scripts/`                         | Application and reference-building source                                  | MIT source, subject to third-party notices                    |
| `src/experiences/consumer-dna/fixtures/`   | Tiny invented genotype exports                                             | Safe synthetic fixtures; never replace with personal data     |
| `public/ref/GRCh37/`, `public/ref/GRCh38/` | Generated ClinVar and gnomAD teaching catalogues                           | Public scientific data; retain provenance and upstream terms  |
| `public/samples/`                          | Public NIST GIAB HG002 benchmark VCF and provenance                        | Explicitly public sample; retain its README and checksums     |
| `data/`                                    | Reference downloads, intermediate tables and joint-frequency region caches | Local build cache, ignored; not required to run the app       |
| `public/ref/publications/`                 | Shared compact PubMed citation labels, manifest and hashed shards          | Public metadata; generated offline and deployed with the site |
| `node_modules/`                            | Installed dependencies and their licenses                                  | Recreate with `npm ci`; do not commit                         |
| `dist/`, `.tanstack/`                      | Generated build/router/platform state                                      | Generated, ignored                                            |
| `tmp/`, `output/`, `coverage/`             | Local scratch files, document exports and test reports                     | Generated or local-only, ignored                              |
| User-selected files                        | A browser File handle and derived calls                                    | Never copy into the repo, public assets or test fixtures      |

## Automatic browser requests

The browser loads the application, styles and illustrations. It also requests
Google Fonts styles/font files through `fonts.googleapis.com` and
`fonts.gstatic.com`. The public sample uses byte-range reads from
`/samples/HG002_GRCh38.vcf.gz`. Evidence chapters download compact catalogue metadata
and small marker/rsID files whole. Result matching runs locally while streaming
the complete `/ref/<build>/catalog.tsv.gz` for the selected build. Sorted VCFs use
one catalogue GET. Unsorted VCF fallback and consumer matching can require
additional complete catalogue passes; HTTP caching can reduce repeated transfer.
These public files are served by GitHub Pages through Cloudflare's proxy, from the
same origin as the site.
Result pages also fetch `/ref/publications/index.json` and the small static shards
needed to label the displayed publication links. These public requests are cached
in browser memory; no live PubMed API requests are made. Shard access can reveal
which groups of public references are being displayed to the static host.

A selected personal file is read through the File API. Its filename, contents,
positions and results are not placed in request URLs or bodies. Catalogue requests
do not include a personal key list or match-dependent Range headers. The host can
still observe the selected reference-build URL, timing, retries and ordinary
connection metadata. Publication-shard requests and reader-initiated source links
can reveal additional interests. There is no genome upload route or remote matching API.
The application includes the limited PostHog usage and error reporting described below.
Hosting and font requests also expose ordinary connection
metadata to their providers.

In production, Cloudflare's proxy automatically adds its Web Analytics/RUM script
to served HTML. This script is not part of the application source or local build.
It sends visited-page and referrer addresses and browser performance measurements
to Cloudflare; reports include browser, device and country-level aggregates.
The standard beacon does not collect the selected filename, genome contents,
genotypes or generated results, and Genomewalk does not add these to analytics
measurements. See Cloudflare's documentation for the
[RUM beacon](https://developers.cloudflare.com/speed/observatory/rum-beacon/) and
[analytics dimensions](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/).

## Usage and error reporting

`src/lib/analytics.ts` initializes PostHog only for production builds on
`genomewalk.com` and `www.genomewalk.com`. The public project token identifies the
project; it is not a secret. Local development, previews, prerendering and ordinary
CI checks do not send events. No server, proxy, source-map upload or private API
key is required. `src/lib/error-reporting.ts` reports sanitized exceptions through
the same client.

Usage events explicitly count file/sample opening attempts, successful reading,
read failures, build-choice steps, a genome becoming ready, chapter runs and
results preparation (started/completed/failed), and static educational
explanations opened. Page views use only `/`, `/chapter/1` through `/chapter/9`,
`/privacy` and `/terms`. Usage properties are limited to upload/sample source,
chapter number. Explanation openings are counted per chapter; their text and identifiers are not sent. A successful chapter run
means its processing finished, not that a reader understood the lesson. Build
selection values, result interactions, variants, genes, source URLs and match
counts are not collected. An opening attempt means an actual file selection/drop
or sample request, not opening and cancelling the file picker.

A random identifier and session identifier live only in memory. They link
milestones within one loaded page, including SPA navigation, and reset on reload.
No analytics identifier is persisted in cookies, localStorage or sessionStorage.
Treat counts as visits/attempts, not distinct people or returning users. Browsers
that block reporting are not counted.

Before sending, every SDK event is rebuilt from an allowlist. Error events include
a predefined code/description/severity, fixed operation/stage/category, chapter
number (1–9) when relevant, build identifier, and application asset URLs with
numeric code locations. Public downloads can also include a fixed resource
category, numeric HTTP status and a reviewed server file path (`public_file`),
such as `/ref/GRCh38/catalog.meta.json`. Only known public sample/reference
paths are accepted; query strings and fragments are removed. Publication label
paths are normalized to `/ref/publications/[shard].json.gz`, so the selected
citation shard is not reported. Grouping keys contain only reviewed diagnostic
values. Coarse diagnostics include allowlisted browser name, major version
(1–999), operating-system family and broad device type. Detection is best effort;
the original user-agent string, OS version, device model and screen details are
not attached.

File errors add a recognized extension from the fixed list in
`src/lib/diagnostics/file-context.ts`, format (VCF,
23andMe, AncestryDNA, unrecognized or unknown), and size band. Decimal bands are
empty, under 1 MB, 1 MB to under 100 MB, 100 MB to under 1 GB, and 1 GB or more;
invalid sizes are unknown. Formats come
from validated readers, never filenames. Exact sizes and personal filenames are
excluded. Recognized extensions include unsupported inputs such as BAM, CRAM,
FASTQ, FASTA, CSV and uncompressed VCF; recognizing a suffix does not add support.

Reading failures may also include these structural categories, reconstructed from
the fixed vocabulary in `src/lib/diagnostics/reading.ts`:

| Property          | Meaning                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `reader_kind`     | Chosen reader: `consumer-dna` or `vcf`; not a validated format.                                                                      |
| `reading_step`    | Format detection, byte reading, archive directory/decompression/integrity/payload selection, header, first record, or later records. |
| `input_container` | `plain`, `zip`, `gzip`, or `bgzf`, based on bytes observed locally.                                                                  |
| `text_encoding`   | A UTF-8/UTF-16 byte-order-mark category, or `unmarked`; no text or encoding guess.                                                   |
| `header_provider` | `23andMe`, `AncestryDNA`, or `unrecognized`, from a recognized header marker.                                                        |
| `header_layout`   | `genotype`, `allele-pair`, or `other`.                                                                                               |
| `format_reason`   | `provider-unrecognized` or `columns-mismatch`.                                                                                       |
| `failure_reason`  | A fixed failed-check label, such as `checksum-mismatch`, `directory-invalid`, or `row-columns-too-few`.                              |

Provider/layout markers describe detection, not validated contents. Context can
survive a later first-record or scan failure. ZIP candidate hints are retained
only when unambiguous. No provider is inferred from a filename or VCF source label.
Original header text, arbitrary column names, DNA rows, row locations, entry names,
checksums, offsets, exact counts and byte lengths are never sent. Primitive native
failures may have a reviewed error code without extra reading context.
Original messages, arbitrary exception/function names, variables, source snippets,
causes, request/response bodies, query strings, referrers, range headers and
attachments are excluded. Aborts are ignored. Expected input-validation failures are warnings;
equivalent warnings are deduplicated by code/group, provider and failure reason,
with at most three distinct warning diagnoses per page
load. Actual failures have a separate ten-event limit. Usage attempt/failure
counts remain independent of error-report deduplication.

Replay, automatic click capture, tracing, logs, surveys, feature flags and remote
SDK configuration are disabled. Only explicit reviewed events are sent; selecting
products in PostHog onboarding does not enable them in Genomewalk. The client does
not create person profiles or enrich events with IP-based location. The PostHog
project also has **Discard client IP data** enabled, preventing server-added IP
addresses from being stored with new events. Reporting requests omit credentials
and referrers. PostHog still receives the network IP when accepting the connection.
The browser deployment check intercepts requests locally and checks
the final transmitted payloads. It never sends CI test events to PostHog.

Outbound source links open the cited public resource when the reader clicks.
For example, a ClinVar link identifies the public variant record being viewed.
Keep this distinction clear: automatic genome comparison is local; clicking an
external source navigates to that provider.

## Offline reference pipeline

The scripts fetch public ClinVar files, public gnomAD frequencies and public
citation data. They run separately from the browser and do not accept a user's
personal file as an input. Citation labels come from PubMed ESummary, joined by
the PMIDs in ClinVar's aggregate germline-classification citation lists, extracted
directly from its VCV XML release. Classification-method and condition-level
references are not merged into those lists. The XML and metadata caches are under ignored
`data/`. These labels identify publications and add no new clinical interpretation.
See `scripts/README.md` for sources and the build
commands. `public/ref` assets are generated before release, not separately for
each person. Public BGZF files use the standard `.gz` extension. Preserve their
bytes without adding HTTP `Content-Encoding: gzip`.

GRCh37 catalogue frequencies are joined through ClinVar allele IDs from the
GRCh38 gnomAD v4.1 data. This is recorded provenance, not a claim that gnomAD v4
was measured directly on GRCh37. The selected-marker data uses build-specific
public queries. Keep the frequency source separate from ClinVar classifications.

## Before publishing repository updates

Review the actual files being published, including any pre-existing history in
the repository used for release. Ignore patterns are a guardrail, not proof that
no personal data or credentials exist. The root MIT license covers project code,
not a relicensing of scientific data, fonts or dependencies. No deployment
credentials are needed for local development.
