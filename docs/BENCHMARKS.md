# Catalogue download benchmark

Run `npm run benchmark` with Node.js 24 or newer. The first benchmark uses only
`public/samples/HG002_GRCh38.vcf.gz`, the documented public GIAB v5.0q sample, and
the shipped GRCh38 catalogue. No personal file or additional NIST download is used.
The command verifies the sample's fixed SHA-256 before processing it.

Reports are written to `output/benchmarks/hg002/report.json` and `summary.md`.
This output directory is Git-ignored. Override it with
`npm run benchmark -- --out-dir /absolute/output/path`.

## What is measured

A temporary static server binds to an available loopback port and closes when the
run finishes. Both methods use the application's VCF parser, matching rules and
annotation parser. The full method downloads and decodes the complete compressed
catalogue. The selective method uses the production index loader and range reader.
Each method independently scans the sample with a fresh catalogue reader. Node
fetch has no persistent HTTP cache. The command verifies that the index identifies
the same catalogue bytes downloaded by the full method.

Measurements count actual HTTP response-body bytes for the catalogue and index,
including every requested block. They exclude the local sample, website assets,
publication-label sidecars, other reference files and HTTP/TLS overhead. This is
not a browser speed, memory, clinical accuracy or educational-outcomes benchmark.

All result fields (including annotations and ordering) must be deeply equal.
Unequal results, zero matches, damaged inputs or failed requests exit nonzero.
Savings are reported even if small or negative; they are not a pass threshold.
The JSON includes file checksums, result digests, per-request bytes, runtime and
Git commit. Local uncommitted changes are marked `modified`; use a clean commit
or a GitHub run for publication measurements.

## Docker

Reuse the project's Dockerfile:

```sh
docker build --target benchmark -t genomewalk-benchmark .
mkdir -p output/benchmarks/hg002
docker run --rm --network none \
  -e BENCHMARK_COMMIT="$(git rev-parse HEAD)" \
  --mount type=bind,source="$PWD/output/benchmarks/hg002",target=/output \
  genomewalk-benchmark --out-dir /output
```

Use a clean checkout for this command: `BENCHMARK_COMMIT` identifies the source
copied into the image; `.git` is deliberately excluded from Docker. The container
needs no external network. Loopback HTTP is available with `--network none`.

## GitHub Actions

In the repository, select **Actions → Benchmarks → Run workflow**. This workflow
is manual and does not deploy the site. It builds the same Docker target, runs
HG002, places the Markdown table in the run summary, and uploads the JSON and
Markdown as the `hg002-benchmark` artifact (retained for 30 days).

HG002 arrives with the repository checkout; each fresh GitHub runner obtains its
own copy. There is no separate genome download or permanent extra dataset cache.
The sample remains in the existing source image, as it already does for site
builds. Generated reports are mounted outside the container and never baked in.

The historical measurements in `VALIDATION.md` and the whitepaper are separate
observations. A new report must be reviewed before replacing those figures.
