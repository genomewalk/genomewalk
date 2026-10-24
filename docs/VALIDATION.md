# Validation

Use Node.js 24 and run `npm ci`, then `npm run check:release` before release.
The release command runs all tests, TypeScript, ESLint, the production build and
validation of the shipped public reference files. CI runs the same command,
then `npm run check:browser` against the resulting `dist/client/` before export.
No personal genome or network rebuild is needed. Install Chromium locally once
with `npx playwright install --only-shell chromium` to run the browser check;
the Docker export target installs it automatically.

## Focused commands

| Command                 | Coverage                                                    |
| ----------------------- | ----------------------------------------------------------- |
| `npm test`              | All application and offline pipeline regression tests       |
| `npm run test:vcf`      | VCF behavior and shared integration                         |
| `npm run test:consumer` | Consumer behavior and shared integration                    |
| `npm run test:data`     | Synthetic offline builds, errors and cache behavior         |
| `npm run data:check`    | Real shipped catalogue, marker and sidecar integrity        |
| `npm run check:deploy`  | Static pages and asset inventory for the production build   |
| `npm run check:browser` | Built-site HG002 journey and catalogue byte-range downloads |
| `npm run data:inputs`   | Cached prerequisites for network-free reference rebuilds    |
| `npm run data:plan`     | Named rebuild stages without writes or requests             |

## Download benchmark

`npm run benchmark` compares complete and selective catalogue downloads using the
bundled HG002 sample. The manual **Benchmarks** GitHub workflow runs the same
command in Docker and publishes a summary and downloadable reports. Select the
`giab-grch38` suite to test all seven public v4.2.1 samples sequentially. See
[BENCHMARKS.md](BENCHMARKS.md) for scope and reproducibility details. This is
separate from ordinary release checks.

## Automated coverage

Tests import the production modules and use synthetic BGZF/TXT/ZIP/gzip inputs,
public records and small DOM stubs. They cover:

- BGZF boundaries, CRC checks, corrupt/truncated input, split UTF-8 characters,
  CRLF, a final row without a newline and cancellation.
- VCF exact allele identity, indels, multi-allelic and incomplete genotypes,
  reference/filtered rows, repeated records, evidence categories and source links.
- 23andMe and Ancestry schemas, missing/I/D calls, chromosome aliases, build and
  strand conflicts, duplicate sites and source-bound rsID lookups.
- Separate experience sessions, direct chapter access, shared scan requests,
  stale scan rejection and retry after an I/O failure.
- Bounded 50,000-row previews that cannot replace full counts, shared catalogue
  lessons that need no genome scan, disclosure links and chart proportions.
- Offline option validation, dry runs, atomic output, failed downloads and
  extraction, cross-build joins, exact marker identities and cached responses.
  Network-free rebuild tests verify a missing marker cache cannot trigger HTTP.
- Reviewed stylesheets, VCF lesson text/templates and unchanged evidence
  helpers. See [regression snapshots](#regression-snapshots).

The catalogue decoder indexes bounded text blocks instead of retaining a
full decompressed byte array, a full decoded string and a full split-line array.
Its regression fixture checks exact keys, indels, zero frequencies, class/star
counts and preview entries.

## Regression snapshots

The fixtures in `tests/fixtures/` preserve reviewed presentation and evidence
behavior. Review intentional changes in the browser and update only the affected
entries. Do not regenerate snapshots to conceal a failure.

- `styles.sha256.json`: reviewed shared styles, including `src/styles/lessons/`.
  CSS Module snapshots strip scope markers before hashing, preserving declarations
  and selectors. Add a snapshot when adding a stylesheet.
- `vcf-lesson-content.sha256.json`: runtime strings and templates for VCF chapters,
  extracted from the previous single-file implementation. Types and literal
  property-access keys are excluded, so type annotations and formatting do not
  change this check.
- `vcf-baseline.sha256.json`: unchanged evidence rules, identity helpers, session
  code and reviewed lesson/result styles. Refactored readers and chapters use
  behavior and content tests instead of obsolete whole-file hashes.
- `vcf-shell.sha256.json`: the preserved VCF chapter execution body.

`npm run format` excludes byte-snapshotted chapter rendering and styles; maintained
new modules are formatted normally. Snapshots supplement behavior tests and
cannot establish correct parsing or matching on their own.

`tests/helpers/vcf.ts` constructs synthetic BGZF records for real-module tests.
The [consumer fixtures](CONSUMER_FILES.md#synthetic-fixtures) cover provider browser
flows. Never add personal genomes or results to either fixture directory.

## Browser regression procedure

The automated browser check serves the production files on loopback and uses
Chromium to choose HG002, open chapter 1 and reach non-empty results. It fails on
browser errors, unsuccessful local requests or invalid byte-range responses.
It also validates both supported builds' catalogue indexes and representative
compressed blocks through HTTP. Docker runs the check with external networking
disabled and fallback fonts. This is a deployment gate, not a check of the live
CDN or every browser and file format; the broader manual procedure below remains
useful.

The browser check also exercises the production PostHog configuration against
local files. Every telemetry request is intercepted locally. Synthetic uncaught,
invalid-file, sample-download, invalid-range and catalogue-download failures verify
useful codes, severity, resource categories, HTTP status, browser/OS/device
categories and per-operation file metadata. Fake private text in filenames,
contents, user-agent strings, errors, page URLs and cookies must not appear in
transmitted events. Only a browser major version and file-size band are allowed.
Switching from an invalid private file to the public sample must replace the file
metadata. Repeated validation warnings must not crowd out actual failures or
suppress usage-attempt counts. Healthy pages emit only reviewed page views and
journey milestones. Local development emits no telemetry. No CI events reach
PostHog; the check also rejects unexpected SDK network requests.

Use the bundled [public HG002 sample](../public/samples/README.md) and
[invented consumer fixtures](CONSUMER_FILES.md#synthetic-fixtures). Keep personal
data out of screenshots.

1. Check the landing illustration and its zoom controls, then load HG002.
2. Visit results directly before running another chapter. Verify only the results
   chapter completes, expand a result and check its raw row, genotype and source links.
3. Run the remaining chapters. Check header disclosures, column links, genotype examples,
   sampled row types, full counts, summary, gnomAD and ClinVar previews.
4. Navigate away and back. Completed output and result disclosures should survive.
5. Select the 23andMe fixture. Progress and prior results must reset. Run all
   chapters, then repeat provider-specific rendering with the Ancestry fixture.
6. Check a narrow viewport for page overflow and usable disclosures. Verify a
   malformed file gives a recoverable error and the next valid import succeeds.

Record actual results and incomplete checks with the change being reviewed.
These instructions are a procedure, not evidence that the checks passed.

## Reference data

`npm run data:check` validates the shipped catalogue, marker, range, publication
and consumer indexes, including their source hashes. Use its output for the
current asset inventory. A fresh upstream rebuild is separate from application
release validation; see the [pipeline guide](../scripts/README.md).

These checks establish software behavior, not clinical validity or support for
every historical provider export. Catalogue coverage and exact-representation
limitations remain. Large files and in-memory indexes have device-dependent costs.

## Historical reference measurements

The following observations were recorded during September 2026 validation and
are retained as benchmark provenance. They are not current release results or
fixed expectations for later public-data releases. The whitepaper's
[engineering snapshot](whitepaper/engineering-snapshot.json) retains the dated
asset sizes, hashes and measurement provenance. Rerun checks and measurements
before citing them for a changed implementation or catalogue.

On 29 September, the static-server comparison returned all 399 HG002 results
identical field-for-field to the full-catalogue reader. Catalogue requests
transferred 5,154,640 index bytes plus 2,745,473 annotation bytes in 203 range
requests, compared with the 26,640,645-byte complete GRCh38 catalogue. These
figures exclude the public genome and application assets. Both synthetic consumer
fixtures retained one result with identical fields; each needed 12,830 annotation
bytes after loading its indexes. This comparison added range locators to the
existing catalogue bytes; it did not perform a fresh upstream rebuild.

Earlier September browser checks recorded 5,201,459 passing HG002 variants
(4,233,644 SNPs and 967,815 indels), with 399 results, 253 genes and 274 records
with publications. The 23andMe fixture had six rows at five sites; Ancestry had
five rows at five sites. Both completed the chapter flow and returned one result.
Desktop and 390 px layouts were visually inspected; these were not pixel-diff
tests. Those earlier observations used the development server.
