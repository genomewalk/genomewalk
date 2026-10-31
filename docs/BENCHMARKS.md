# Matching correctness checks

Use Node.js 24 or newer. The benchmark verifies the current VCF matcher's results
using the shipped GRCh38 catalogue and public GIAB samples. It checks correctness
only: no indexed-download comparisons, Tabix comparisons, transfer measurements,
timing or memory measurements.

| Command                                    | Inputs                                                   |
| ------------------------------------------ | -------------------------------------------------------- |
| `npm run benchmark`                        | Bundled HG002 v5.0q sample; no external sample download  |
| `npm run benchmark -- --suite giab-grch38` | HG001–HG007 GRCh38 v4.2.1; seven public sample downloads |

## How correctness is checked

A small benchmark-only reference lookup reads the local catalogue and computes
expected matches for the sample. The production matcher then processes the same
sample using the real streaming catalogue loader. A temporary static server on
loopback supplies the production catalogue and metadata without changing the
published files.

Every result field must match the reference answer, including evidence,
genotypes, quality information and result ordering. The reference lookup is a
simple answer generator for verification, not another download method under
comparison. Synthetic tests separately cover matching edge cases and streaming
failures; see [VALIDATION.md](VALIDATION.md).

The run exits unsuccessfully if verification fails, an input is damaged, or a
required request fails. Failed samples remain in the report and the remaining
samples still run. The suite passes only when every requested sample passes.
This checks software behavior against the same catalogue and matching rules; it
does not establish clinical accuracy or completeness of the catalogue.

## Reports

Reports are written after each sample to
`output/benchmarks/<suite>/report.json` and `summary.md` (Git-ignored). Override
this location with `--out-dir /absolute/output/path`.

The summary shows pass/fail and expected and actual result counts. The JSON also
records sample provenance, catalogue and sample hashes, result digests, runtime
and Git revision. Local uncommitted changes are marked `modified`. Result digests
use canonical JSON with sorted object keys and unchanged array order. File hashes
and expected input sizes are integrity/provenance checks, not performance metrics.
Historical download-comparison reports and their comparison implementations have
been removed.

## Inputs and provenance

The manifest in `scripts/benchmark/samples.ts` pins upstream URLs and byte sizes.
The bundled sample has a pinned SHA-256. For v4.2.1, published NCBI MD5 checksums
are pinned where available (HG001 and HG005–HG007). NCBI's release directories do
not supply checksums for the selected HG002–HG004 files; those are checked against
pinned sizes and the parser verifies BGZF CRCs. Every report records the actual
sample SHA-256. A locally recorded hash is a provenance identifier rather than
independent upstream authentication when no published checksum is available.

HG002–HG004 and HG005–HG007 are child-and-parent families, not seven unrelated
people. The v4.2.1 files cover autosomal benchmark calls and differ from the bundled
v5.0q sample. No benchmark BED filtering is applied: this verifies catalogue
matching, not variant-calling accuracy. The command does not accept personal files.

The bundled HG002 file is reused and never removed. The seven-sample suite
requires about 953 MB of public downloads in total. It downloads, verifies and
tests one sample at a time, then removes its temporary directory, including on
failure. There is no persistent sample cache or full uncompressed copy. Use the
bundled suite for local checks and GitHub Actions for the seven-sample suite to
avoid unnecessary local downloads.

## GitHub Actions

Select **Actions → Benchmarks → Run workflow**, then choose `hg002` or
`giab-grch38`. The workflow builds the Docker benchmark target, runs samples
sequentially and publishes the combined correctness table in the run summary.
The `<suite>-benchmark` artifact contains `report.json` and `summary.md` and is
retained for 30 days. This workflow does not deploy the site.

A fresh runner obtains the bundled sample from the checkout. The seven-sample
suite downloads versioned NIST files; they are not committed or baked into the
image. Only reports are uploaded. The workflow fails if any sample fails.

## Docker

```sh
docker build --target benchmark -t genomewalk-benchmark .
mkdir -p output/benchmarks/hg002
docker run --rm --network none \
  -e BENCHMARK_COMMIT="$(git rev-parse HEAD)" \
  -e BENCHMARK_WORKING_TREE=clean \
  --mount type=bind,source="$PWD/output/benchmarks/hg002",target=/output \
  genomewalk-benchmark --suite hg002 --out-dir /output
```

Use a clean checkout for the example above, or set `BENCHMARK_WORKING_TREE=modified`
when building local changes. `.git` is excluded from Docker, so the supplied
revision and working-tree state must describe the source copied into the image.
The bundled suite works with `--network none` because loopback remains available.
For `giab-grch38`, change the suite and output path and omit `--network none` to
allow NIST downloads.
