# Regression snapshots

These fixtures preserve presentation and evidence behavior during maintenance.
Do not regenerate them to conceal a failure. Review intentional changes in the
browser and update only the affected entries.

- `styles.sha256.json`: reviewed shared styles, including every file in
  `src/styles/lessons/`. CSS Module snapshots strip scope markers before hashing,
  preserving the original declarations and selectors. Add a snapshot when adding a stylesheet.
- `vcf-lesson-content.sha256.json`: string and template contents for each of the
  nine VCF chapters, extracted from the previous single-file implementation.
  Types and literal property-access keys are excluded, so TypeScript annotations
  and formatting do not change this check.
- `vcf-baseline.sha256.json`: unchanged evidence rules, identity helpers, session
  code and the reviewed lesson/result styles. Refactored readers and chapter code
  are covered by behavior and content tests instead of obsolete whole-file hashes.
- `vcf-shell.sha256.json`: the preserved VCF chapter execution body.

`npm run format` excludes byte-snapshotted chapter rendering and styles. Maintained new
modules are formatted normally. The snapshots supplement tests; they cannot
establish correct parsing or matching on their own.

`tests/helpers/vcf.ts` constructs synthetic BGZF records for real-module tests.
Optional provider fixtures live in `src/experiences/consumer-dna/fixtures/`.
Never add a personal genome or personal result to these directories.
