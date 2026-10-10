# Validation

Use Node.js 24 and run `npm ci`, then `npm run check:release` before release.
The release command runs all tests, TypeScript, ESLint, the production build and
validation of the shipped public reference files. CI runs the same command.
No personal genome or network rebuild is needed.

## Focused commands

| Command                 | Coverage                                                  |
| ----------------------- | --------------------------------------------------------- |
| `npm test`              | All application and offline pipeline regression tests     |
| `npm run test:vcf`      | VCF behavior and shared integration                       |
| `npm run test:consumer` | Consumer behavior and shared integration                  |
| `npm run test:data`     | Synthetic offline builds, errors and cache behavior       |
| `npm run data:check`    | Real shipped catalogue, marker and sidecar integrity      |
| `npm run check:deploy`  | Static pages and asset inventory for the production build |
| `npm run data:inputs`   | Cached prerequisites for network-free reference rebuilds  |
| `npm run data:plan`     | Named rebuild stages without writes or requests           |

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
  helpers. See [fixture documentation](../tests/fixtures/README.md).

The catalogue decoder now indexes bounded text blocks instead of retaining a
full decompressed byte array, a full decoded string and a full split-line array.
Its regression fixture checks exact keys, indels, zero frequencies, class/star
counts and preview entries.

## Browser regression procedure

Use the bundled public HG002 sample and the invented fixtures in
`src/experiences/consumer-dna/fixtures/`. Keep personal data out of screenshots.

1. Check the landing illustration and its zoom controls, then load HG002.
2. Visit results directly before running another chapter. Verify only chapter 9
   completes, expand a result and check its raw row, genotype and source links.
3. Run chapters 1–8. Check header disclosures, column links, genotype examples,
   sampled row types, full counts, summary, gnomAD and ClinVar previews.
4. Navigate away and back. Completed output and result disclosures should survive.
5. Select the 23andMe fixture. Progress and prior results must reset. Run all nine
   chapters, then repeat provider-specific rendering with the Ancestry fixture.
6. Check a narrow viewport for page overflow and usable disclosures. Verify a
   malformed file gives a recoverable error and the next valid import succeeds.

Record the actual results and any incomplete checks below rather than treating
these instructions as evidence that they passed.

## Reference data

The shipped catalogues contain 511,197 GRCh38 records and 511,193 GRCh37 records,
with five cited markers per build. Validation also checks the consumer sidecars'
source hashes. This maintainability pass does not rewrite scientific assets or
change matching eligibility. A fresh full-network gnomAD rebuild is separate
from application release validation; see [pipeline instructions](../scripts/README.md).

These checks establish software behavior, not clinical validity or support for
every historical provider export. Catalogue coverage and exact-representation
limitations remain. Large files and in-memory indexes have device-dependent costs.

## September 29, 2026 cleanup verification

### Static build and byte-range transport

- The production build prerenders 12 HTML pages into `dist/client/`. The file-only
  preview serves those pages without SSR or an application API. Deep chapter URLs
  resolve to their own `index.html`; HTTP range responses return 206 and exact bytes.
- The 178-test suite covers rejected full-file fallback, wrong ranges/lengths,
  decompression by a host, cancellation, split UTF-8 and cross-block rows, indels,
  named reference contigs, stale block hashes and local-file behavior. TypeScript,
  lint, production build, static preflight and both reference builds validate.
- HG002 returned all 399 results identical field-for-field to the full-catalogue
  reader. Its catalogue requests transferred 5,154,640 index bytes plus 2,745,473
  annotation bytes (203 range requests), compared with the 26,640,645-byte complete
  GRCh38 catalogue. These figures exclude the public genome and app assets.
- Both 23andMe and Ancestry synthetic fixtures retained their one result with
  identical fields; each needed 12,830 annotation bytes after loading its indexes.
- Browser checks on the file-only static server exercised the public sample,
  its 399 results and local synthetic consumer-file import. Neither flow needs
  a server-side matching operation. Catalogue key matching remains local; range
  headers still expose selected catalogue regions to the static host.
- Existing catalogues were not rewritten. `data:ranges` generated locators from
  their exact bytes; validation re-creates every locator and block hash. A fresh
  upstream scientific-data rebuild was not run.

### Earlier cleanup checks

- All 174 application/pipeline tests, TypeScript, ESLint, production compilation
  and shipped-data validation passed. Search tests cover category overlap, phrase
  fallback, suggestion deduplication and HTML escaping. New offline preflight
  tests cover missing inputs and incorrect cached marker identities.
- Removed 130 unused CSS selector branches. An AST comparison against the
  pre-cleanup styles confirmed every retained selector, declaration and rule
  order stayed identical, including across the new lesson stylesheet imports.
  Reviewed stylesheet snapshots now cover the smaller files.
- HG002 direct results still returned 399 variants, 253 genes and 274 records
  with publications. Search, keyboard suggestions, pagination, evidence filters,
  expanded details and restoration after chapter navigation worked. Chapter 2's
  linked REF disclosure also opened correctly.
- The synthetic 23andMe fixture still returned its single ALDH2 result. Its
  expanded raw row, allele explanation and publication links rendered correctly.
  Chapter 2's genotype link opened its disclosure. The lesson and expanded
  results had no page overflow at a 390 px viewport. Landing zoom controls and
  representative desktop/mobile layouts were visually inspected; this was not
  a full pixel-diff test or a repeat of every browser scenario below.
- An isolated VCF-only tree passed 103 tests, TypeScript and lint with the
  optional consumer runtime and builder directories removed.
- `data:plan -- --offline --only GRCh37` produced the expected stages, including
  the GRCh38 frequency join. `data:inputs` correctly reported ten missing raw
  marker-response caches in this checkout. A complete offline rebuild therefore
  needs those caches populated first; no scientific assets were rebuilt during
  this pass. The shipped catalogues, marker files and sidecars passed validation.

## Earlier September 2026 maintainability pass

- All 160 application/pipeline tests passed, including the deployment-size
  regression. TypeScript, ESLint, production compilation and shipped-data validation passed.
- Both catalogues were rebuilt in an isolated output directory using cached inputs.
  GRCh38 and GRCh37 outputs were byte-for-byte identical to their shipped files.
  A fresh full-network frequency/marker rebuild was not performed.
- HG002 exercised all nine VCF chapters across browser runs. Full counts remained
  5,201,459 passing variants (4,233,644 SNPs and 967,815 indels). Results remained
  399 variants, 253 genes and 274 records with publications. Direct results access,
  expanded result restoration and header/column disclosure links were verified.
- Both synthetic consumer fixtures completed all nine chapters. 23andMe retained
  six rows/five sites; Ancestry retained five rows/five sites. Each produced one
  catalogue result. Direct Ancestry results completed only chapter 9. Selecting a
  new file reset progress, and a valid import succeeded after an invalid-header error.
- VCF results and consumer row diagrams had no page overflow at a 390 px viewport.
  Landing canvas/zoom controls worked; existing styles and VCF lesson templates
  passed snapshot checks. This was visual inspection, not a full pixel-diff test.
- An isolated VCF-only source tree passed its 91 tests with the optional consumer
  runtime and builder folders removed. TypeScript, lint and a production build
  passed in that isolated tree too.
- Browser observations in this earlier pass used the development server.
