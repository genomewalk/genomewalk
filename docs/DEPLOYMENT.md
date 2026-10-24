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
requires non-empty results and successful sample/catalogue byte-range requests.
It also checks catalogue downloads for both GRCh37 and GRCh38. External
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
`public/`; it does not download upstream databases or rebuild them. The current
site is approximately 107 MiB, below GitHub Pages' 1 GB published-site limit.
See [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
and [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

Sentry error reporting is configured in `src/lib/error-reporting.ts`. The public
browser DSN requires no GitHub secret or additional deployment service. Vite adds
a build timestamp as the release identifier; only the live domain sends reports.
No source-map upload is configured. See the [reporting data inventory](DATA_AND_PRIVACY.md#error-reporting).

Reports use the predefined codes in `src/lib/app-error.ts`. For example,
`DNA_HEADER_MISSING` is an expected file-validation warning; `HTTP_ERROR` with
`resource=catalogue-entries` and `http_status=503` identifies a failed public
catalogue download. Inspect `area`, `stage`, `chapter`, and `release` to locate
the operation. `UNEXPECTED_ERROR` and `JS_*` retain sanitized asset line/column
locations, not source-mapped stacks. Sentry's issue list may need refreshing.
Existing historical events keep their old descriptions.

New reports also carry `browser_name`, `browser_major` when available, `os_name`
and `device_type`. File-related failures carry `file_extension`, `file_format`
and `file_size_band`. These are coarse diagnostic tags, not filenames, device
identifiers or exact file sizes. Browser/device detection is best effort;
`unknown` file format means identification had not completed, while
`unrecognized` means the format/header was rejected. Historical events do not
gain these fields retroactively.

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
responses. No analytics snippet or token is bundled in the application, and local
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
Recheck byte ranges below.

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

## Verify the deployed files

```sh
curl --silent --show-error \
  --dump-header /tmp/genomewalk-range.headers \
  --output /tmp/genomewalk-range.bin \
  --header 'Range: bytes=0-31' \
  https://genomewalk.com/ref/GRCh38/catalog.tsv.gz
cat /tmp/genomewalk-range.headers
wc -c /tmp/genomewalk-range.bin
```

Expect **206 Partial Content**, a `Content-Range` describing bytes `0-31` and the
catalogue's total size, and exactly **32 bytes**. There must be no HTTP
`Content-Encoding` such as `gzip`, `br` or `zstd`. These files are already compressed
on disk; the app validates their original bytes before decompressing them.
Repeat for the GRCh37 catalogue and public sample. Open `/chapter/9` directly and
test the teaching sample's results.

Range requests reveal requested public-catalogue offsets to the hosting provider.
They do not upload the personal genome or genotype values. The Privacy Policy
explains this distinction.
