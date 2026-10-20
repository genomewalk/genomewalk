# Catalogue download benchmarks

Use Node.js 24 or newer. Both suites use the shipped GRCh38 catalogue and public
GIAB samples only. No personal file is accepted by the command.

| Command                                    | Inputs                                                      |
| ------------------------------------------ | ----------------------------------------------------------- |
| `npm run benchmark`                        | Bundled HG002 v5.0q teaching sample; no NIST download       |
| `npm run benchmark -- --suite giab-grch38` | HG001–HG007 GRCh38 v4.2.1; about 953 MB downloaded in total |

The second command downloads each sample, verifies it, tests it, and removes its
temporary directory before starting the next sample. Cleanup also runs when a
sample fails. There is no persistent cache. The largest sample is 156 MB; full
uncompressed copies are not saved. Use GitHub Actions to avoid these downloads on
your own computer. The existing bundled HG002 teaching sample is never removed.

## GitHub Actions

Select **Actions → Benchmarks → Run workflow**, then choose `hg002` or
`giab-grch38`. The manual workflow builds the existing Docker benchmark target,
runs the selected suite sequentially and publishes a combined results table in
the run summary. Download the `<suite>-benchmark` artifact for `report.json` and
`summary.md` (retained for 30 days). It does not deploy the site.

A fresh runner obtains the teaching sample with the repository checkout. For the
seven-sample suite, the runner downloads versioned files from NIST as needed;
those files are neither committed to Git nor baked into the image. Only reports
are uploaded as artifacts. A failed sample remains visible in the combined table,
other samples still run, and the workflow ultimately fails if any sample fails.

## Inputs and provenance

The manifest in `scripts/benchmark/samples.ts` pins upstream URLs and byte sizes.
The bundled sample has a pinned SHA-256. For v4.2.1, published NCBI MD5 checksums
are pinned where available (HG001 and HG005–HG007). NCBI's release directories do
not supply checksums for the selected HG002–HG004 files; those are checked against
pinned sizes and the parser verifies their BGZF CRCs. Every report records the
actual SHA-256 of every sample. A recorded SHA-256 is a reproducibility identifier,
not independent upstream authentication when no published checksum is available.

HG002–HG004 and HG005–HG007 are child-and-parent families; the suite does not
represent seven unrelated people. The v4.2.1 files cover autosomal benchmark calls
and differ from the bundled v5.0q sample. These are software download comparisons,
not variant-calling accuracy evaluations; no benchmark BED filtering is applied.

## What is measured

A temporary static server binds to an available loopback port and closes after
each comparison. Both methods use the application's VCF parser, matching rules
and annotation parser. The full method downloads and decodes the complete
compressed catalogue. The selective method uses the production index loader and
range reader. Each method independently scans the sample with a fresh catalogue
reader. Node fetch has no persistent HTTP cache. The command checks that the index
identifies the full catalogue bytes, and that the catalogue and index stay the
same across samples.

Measurements count actual HTTP response-body bytes for the catalogue and index,
including every requested block. They exclude sample downloads, website assets,
publication-label sidecars, other reference files and HTTP/TLS overhead. This is
not a browser speed, memory, clinical accuracy or educational-outcomes benchmark.

All result fields (including annotations and ordering) must be deeply equal.
Unequal results, zero matches, damaged inputs or failed requests exit nonzero.
Savings are reported even if small or negative; they are not a pass threshold.
Minimum, median and maximum savings include successful samples only; incomplete
or failed suites are explicitly labelled. The JSON includes each sample's source,
file checksums, result digests, per-request bytes, runtime and Git commit.

Reports use schema 2 and are written after every sample to
`output/benchmarks/<suite>/report.json` and `summary.md` (Git-ignored). Override
with `--out-dir /absolute/output/path`. Local uncommitted changes are marked
`modified`; use a clean GitHub run for publication measurements.

## Docker

```sh
docker build --target benchmark -t genomewalk-benchmark .
mkdir -p output/benchmarks/giab-grch38
docker run --rm \
  -e BENCHMARK_COMMIT="$(git rev-parse HEAD)" \
  --mount type=bind,source="$PWD/output/benchmarks/giab-grch38",target=/output \
  genomewalk-benchmark --suite giab-grch38 --out-dir /output
```

Use a clean checkout: `BENCHMARK_COMMIT` identifies the source copied into the
image; `.git` is deliberately excluded from Docker. The seven-sample suite needs
external network access for NIST downloads. The bundled `hg002` suite also works
with `--network none`; loopback HTTP remains available.

The historical figures in `VALIDATION.md` and the whitepaper are separate
observations. Review new reports before replacing those figures.
