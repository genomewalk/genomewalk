# Static deployment

GitHub Pages serves **all of `dist/client/`** at **`https://genomewalk.com`**:
HTML, JavaScript, CSS, public catalogues and the teaching sample. Personal genomes
stay in the browser. There is no application server, upload endpoint or
database. `dist/server/` is used to prerender HTML and is not deployed.

## Local build and preview

From the project root, with Docker running:

```sh
docker compose up --build
```

This runs all release checks, builds the app, then serves the static output.
The site image contains the generated files and a small file server; it has no
application dependencies or upload handler. Press Ctrl+C to stop it.

To export the static folder after release checks and a Chromium browser check:

```sh
docker build --target export --output type=local,dest=dist/client .
```

With Node.js 24, run `npm ci`, then `npm run check:release`. Install the test
browser once with `npx playwright install --only-shell chromium`, then run
`npm run check:browser`. Use `npm run preview` for a manual preview.

The preview serves `dist/client/` at `http://localhost:5283`, with directory indexes
and byte ranges. Keep the directory structure intact. `/chapter/9` resolves to
`chapter/9/index.html`. Both local and production builds read `/ref/` and
`/samples/` from their own origin, without CORS configuration.

## GitHub deployment

In the repository's **Settings → Pages**, select **GitHub Actions** as the source.
The [Deploy site workflow](../.github/workflows/deploy.yml) runs on each push to
`main`, or through **Actions → Deploy site → Run workflow**. It exports the same
static build used by local previews, with an additional browser check:

```sh
docker build --target export --output type=local,dest=dist/client .
```

Before upload, Chromium opens the built site on `127.0.0.1` inside the build
container, chooses the public HG002 sample and opens its results. The check
requires non-empty results, successful public-sample byte ranges and streamed
catalogue downloads. It checks catalogue metadata, complete downloads and integrity
for both GRCh37 and GRCh38. External
networking is disabled during this check; all inputs come from the built site.

A failure stops the build before artifact upload or deployment, leaving the
currently published site in place. This checks the application and bundled files;
it cannot validate production Cloudflare rules, GitHub Pages headers or a
visitor's network. It does not add scheduled checks or automatic rollback.

After validation, GitHub's Pages actions upload the entire `dist/client/` artifact
and publish it. Deployment uses the workflow's temporary `GITHUB_TOKEN` and OIDC;
there are no credentials to add to repository secrets. The `github-pages`
environment restricts deployment to `main`. The same workflow validates pull requests without publishing them. There is no
separate validation workflow or container registry.

An ordinary deploy uses the public reference files already committed under
`public/`; it does not download upstream databases or rebuild them. The
published folder must remain within GitHub Pages' 1 GB published-site limit.
See [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
and [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

PostHog usage and error reporting is configured in `src/lib/analytics.ts` and
`src/lib/error-reporting.ts`. The public project token and ingestion host require
no GitHub secret or additional deployment service. The supplied project token and
host are public constants included in the static build. Vite adds a build timestamp
as the release identifier; only the
live domain sends events. No source-map upload is configured. See the
[reporting data inventory](DATA_AND_PRIVACY.md#usage-and-error-reporting).

Keep **Settings → Project → Privacy → Discard client IP data** enabled in PostHog.
This is separate from the client's `$geoip_disable` flag: it prevents PostHog from
adding the connection's IP address to stored events. Enable it before sending
events if the project is replaced. The deprecated SDK `ip` option has no effect.

PostHog receives explicit page views and journey milestones so funnels can compare
personal-file attempts with public-sample use, chapter runs and results preparation.
Identifiers last only for the current loaded page; counts do not identify distinct
people across visits. Replay, automatic click capture and unused products stay
disabled even when selected during PostHog onboarding.

Error Tracking uses predefined codes in `src/lib/app-error.ts`. For example,
`DNA_HEADER_MISSING` is an expected file-validation warning; `HTTP_ERROR` with
`resource=catalogue-entries` and `http_status=503` identifies a failed public
catalogue download. `public_file` identifies the reviewed server path, for example
`/ref/GRCh38/catalog.meta.json`; it excludes queries, byte ranges and personal
filenames. Publication labels use `/ref/publications/[shard].json.gz` without the
selected shard. Inspect `area`, `stage`, `chapter`, and `release` to locate the
operation. Older events do not gain this property retroactively. `UNEXPECTED_ERROR`
and `JS_*` retain sanitized asset line/column locations, not source-mapped stacks.

Reports carry `browser_name`, `browser_major` when available, `os_name` and
`device_type`. File-related failures carry `file_extension`, `file_format` and
`file_size_band`. These are coarse diagnostic properties, not filenames, device
identifiers or exact file sizes. Browser/device detection is best effort;
`unknown` file format means identification had not completed, while `unrecognized`
means the format/header was rejected.

Reading failures can also carry `reader_kind`, `reading_step`, `input_container`,
`text_encoding`, `header_provider`, `header_layout`, `format_reason`, and
`failure_reason`. All use the fixed vocabulary in `src/lib/diagnostics/reading.ts`;
no arbitrary header/source strings or numeric file locations are accepted.
`header_provider` describes a recognized 23andMe/AncestryDNA header marker, even
when reading fails before a source is returned. It does not claim a validated
export. A VCF reader does not infer a provider from its sample/source fields.

For example, `DNA_COLUMNS_INVALID` with `header_provider=AncestryDNA`,
`reading_step=first-record`, and `failure_reason=row-columns-too-few` identifies
the provider marker and exact structural check without including a DNA row.
`ARCHIVE_INVALID` with `input_container=gzip` and
`failure_reason=checksum-mismatch` distinguishes damaged compressed data from an
unsupported header. `text_encoding=utf16le-bom` identifies an observed encoding
marker; the extra reporting does not change which encodings are supported.

Unknown provider and mismatched columns still use `DNA_FORMAT_UNSUPPORTED`,
distinguished by `format_reason`. Unambiguous unsupported ZIP candidates retain
the same fixed hints under `ARCHIVE_NO_DNA`. Issue fingerprints stay stable;
different provider/failure reasons can emit separate occurrences within the
existing three-warning cap, while equivalent retries are deduplicated. Older
reports cannot recover the new fields. Some native primitive failures cannot
carry context, but retain their reviewed failure code.

File rejection codes distinguish an empty file (`FILE_EMPTY`) and unsupported
formats from corrupt data. ZIP errors distinguish no supported export
(`ARCHIVE_NO_DNA`), multiple exports (`ARCHIVE_MULTIPLE_DNA`), ZIP-wrapped VCFs
(`ARCHIVE_VCF_UNSUPPORTED`), and corruption (`ARCHIVE_INVALID`). These fixed
codes add diagnostic detail without recording archive entry names or contents.
Application-imposed size, row, header, line and archive-entry-count cutoffs have
been removed; browser resources and supported archive formats still constrain
processing. Older events retain their original codes, including retired limit codes.

Recognized native allocation failures report `BROWSER_ALLOCATION_FAILED`; explicit
browser value-size failures report `BROWSER_DATA_LIMIT`. Neither is inferred from
the file's size band. Other range errors remain `JS_RANGE_ERROR`, and unreadable
local files report `FILE_READ_FAILED`. Only reviewed codes and existing coarse
metadata are sent, never the original native message. These reports cover
catchable errors: a browser-terminated tab cannot reliably send an event, and a
missing completion event alone does not identify its cause.

## Connect genomewalk.com through Cloudflare DNS

1. In GitHub **Settings → Pages → Custom domain**, save `genomewalk.com` before
   changing DNS. With an Actions deployment, no `CNAME` file is needed.
2. In Cloudflare **genomewalk.com → DNS → Records**, configure these records.
   Use **DNS only** initially (grey cloud), with **TTL Auto**.

| Type  | Name  | Target                 |
| ----- | ----- | ---------------------- |
| A     | `@`   | `185.199.108.153`      |
| A     | `@`   | `185.199.109.153`      |
| A     | `@`   | `185.199.110.153`      |
| A     | `@`   | `185.199.111.153`      |
| CNAME | `www` | `genomewalk.github.io` |

Replace conflicting apex A/AAAA/CNAME records and the previous `www` target.
Keep unrelated mail and verification records. GitHub redirects `www` to the
configured apex domain. The GoDaddy registration stays where it is; Cloudflare
already manages DNS through the domain's assigned nameservers.

3. Wait for GitHub's DNS check and HTTPS certificate, then enable **Enforce HTTPS**
   in **Settings → Pages**. DNS and certificate issuance can take time.

The app uses root-relative URLs, so serve it at the custom domain's root. The
temporary project address `genomewalk.github.io/genomewalk/` is not the intended
application URL. See [GitHub's domain setup](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

### Cloudflare proxy, analytics and bot protection

Production traffic passes through Cloudflare's proxy before reaching GitHub Pages.
Cloudflare Web Analytics automatically adds its browser script to eligible HTML
responses. No Cloudflare analytics snippet or token is bundled in the application, and local
development does not load this script. View visits and page performance under
**Cloudflare → Web Analytics → genomewalk.com**. Keep the site's Privacy Policy
and [network inventory](DATA_AND_PRIVACY.md) aligned with the enabled analytics.

Once GitHub HTTPS works, Cloudflare can proxy the A and CNAME records (orange
cloud). Use **Full (strict)** SSL/TLS so the connection to GitHub stays encrypted
and its certificate is checked. Cloudflare then handles visitors before fetching
the static site from GitHub. See [proxy status](https://developers.cloudflare.com/dns/proxy-status/)
and [Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).

Start with **Bot Fight Mode off**. The free feature cannot exclude paths and can
challenge legitimate automated downloads. A challenge returns HTML rather than
catalogue bytes, breaking the browser's `fetch` requests. Cloudflare's automatic
DDoS protection still applies to proxied traffic. Paid **Super Bot Fight Mode**
supports exceptions; exclude `/ref/` and `/samples/` from challenges if using it.
See [Bot Fight Mode limitations](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/)
and [challenge compatibility](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/).

When enabling the proxy, preserve the query string (`?v=SHA256`) in the cache key,
and avoid HTTP compression or body transformations on `/ref/` and `/samples/`.
Recheck catalogue streams and public-sample byte ranges below.

## Refresh public reference data

Run **Actions → Build reference data → Run workflow** when you want fresh public
inputs. The [manual workflow](../.github/workflows/reference-data.yml) builds the tools image,
runs pipeline tests with container networking disabled, then runs `data:refresh`
with network access and an isolated output directory. Locally, the equivalent is:

```sh
docker compose run --build --rm tools data:refresh -- --jobs 4
```

The pipeline validates its generated artifacts and saves **reference-data** for
seven days. It does not publish or commit them. Download that artifact, replace
local `public/ref/` with its contents, run
`docker compose run --build --rm tools data:check` (or `npm run data:check`), then commit and
push the reviewed public files. The ordinary deployment publishes that release.
For local pipeline targets, run `npm run data` or read the
[offline pipeline guide](../scripts/README.md).

Selection-rule changes also require regenerated public files. Run `npm run data:build`
to reuse downloaded ClinVar inputs and compatible gnomAD regions while rebuilding
frequency coverage, both catalogues and compact metadata, publication labels and
consumer rsID sidecars. Deploy the validated set together; changing the builder
alone does not change the catalogue already served to browsers.

## Verify the deployed files

Catalogues use ordinary **200 OK** downloads, not byte-range requests. Inspect the
published metadata and compare its `source.sha256` with the compressed response:

```sh
curl --fail --silent --show-error \
  https://genomewalk.com/ref/GRCh38/catalog.meta.json
curl --fail --silent --show-error \
  --dump-header /tmp/genomewalk-catalog.headers \
  https://genomewalk.com/ref/GRCh38/catalog.tsv.gz | shasum -a 256
cat /tmp/genomewalk-catalog.headers
```

The body must contain the exact stored BGZF bytes; there must be no HTTP
`Content-Encoding` such as `gzip`, `br` or `zstd` on the catalogue. The runtime
checks the complete response's length and digest before accepting results. Repeat
for GRCh37. Publish `catalog.meta.json` and `catalog.tsv.gz` together with their
matching consumer rsID sidecars. The metadata's small public examples allow the
ClinVar teaching chapter to open without downloading the whole catalogue.

The public sample still uses byte ranges:

```sh
curl --fail --silent --show-error \
  --dump-header /tmp/genomewalk-range.headers \
  --output /tmp/genomewalk-range.bin \
  --header 'Range: bytes=0-31' \
  https://genomewalk.com/samples/HG002_GRCh38.vcf.gz
cat /tmp/genomewalk-range.headers
wc -c /tmp/genomewalk-range.bin
```

Expect **206 Partial Content**, `Content-Range` describing bytes `0-31` and the
sample's total size, exactly **32 bytes**, and no HTTP `Content-Encoding`.
Open `/chapter/9` directly and test the teaching sample's results.

Sorted VCFs make one catalogue GET for the selected build. Unsorted VCF fallback
and consumer matching may read that complete public catalogue more than once;
browser caching can reduce repeated transfer. No catalogue request carries a
personal variant key, genotype or match-dependent byte range. Hosting metadata
and optional publication-shard requests remain visible to their providers, as
described in the Privacy Policy.
