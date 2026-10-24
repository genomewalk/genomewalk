#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Response as BrowserResponse } from "playwright";
import { createStaticServer } from "./lib/static-server.ts";
import { loadRangeCatalogue } from "../src/lib/catalogues/catalogue-ranges.ts";
import { SAMPLE } from "../src/lib/catalogues/public-sample.ts";
import { readByteRange } from "../src/lib/io/http-range.ts";
import type { Fetcher } from "../src/lib/io/types.ts";
import { RESULTS_STEP } from "../src/lib/navigation/journey.ts";
import { checkTelemetry } from "./lib/check-telemetry.ts";

const ACTION_TIMEOUT = 180_000;
const TOTAL_TIMEOUT = 300_000;
const directory = fileURLToPath(new URL("../dist/client/", import.meta.url));
const stage = (message: string) => console.log(`[browser] ${message}`);

async function checkReferences(origin: string, signal: AbortSignal) {
  const fetcher: Fetcher = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, origin);
    assert.equal(url.origin, origin, "Reference checks must stay on the local static server");
    return fetch(url, { ...init, signal });
  };
  const sizes = new Map<string, number>([[SAMPLE.url, SAMPLE.bytes]]);
  for (const build of ["GRCh37", "GRCh38"]) {
    const catalogue = await loadRangeCatalogue(build, signal, undefined, fetcher);
    assert.ok(catalogue.n > 0, `${build} catalogue is empty`);
    const keys = [...catalogue.map.keys()];
    const representatives = [
      ...new Set([keys[0]!, keys[Math.floor(keys.length / 2)]!, keys.at(-1)!]),
    ];
    // The production reader verifies block hashes, decoded sizes and allele identities.
    const rows = await catalogue.map.readEntries(representatives, signal);
    assert.equal(rows.size, representatives.length);
    assert.ok(catalogue.map.bytesRead > 0, `${build} catalogue ranges were not read`);
    sizes.set(`/ref/${build}/catalog.tsv.gz`, catalogue.source.size);
    stage(
      `${build}: index and ${rows.size} representative catalogue rows verified over HTTP ranges`,
    );
  }
  const sample = await readByteRange(SAMPLE.url, 0, 65_536, {
    size: SAMPLE.bytes,
    signal,
    fetcher,
  });
  assert.deepEqual([...sample.subarray(0, 2)], [31, 139], "Public sample must remain gzip bytes");
  return sizes;
}

function checkRangeResponse(response: BrowserResponse, size: number) {
  const requested = /^bytes=(\d+)-(\d+)$/.exec(response.request().headers()["range"] || "");
  const headers = response.headers();
  const received = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(headers["content-range"] || "");
  const label = new URL(response.url()).pathname;
  assert.ok(requested, `${label} was requested without a byte range`);
  assert.equal(response.status(), 206, `${label} must return HTTP 206`);
  assert.ok(received, `${label} has no valid Content-Range`);
  const start = Number(requested[1]);
  const end = Number(requested[2]);
  assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start);
  assert.deepEqual(received.slice(1).map(Number), [start, end, size], `${label} range mismatch`);
  assert.ok(end < size, `${label} range exceeds the file size`);
  assert.ok(
    !headers["content-encoding"] || headers["content-encoding"] === "identity",
    `${label} must not be transformed by Content-Encoding`,
  );
  assert.equal(
    Number(headers["content-length"]),
    end - start + 1,
    `${label} range length mismatch`,
  );
}

async function checkJourney(browser: Browser, origin: string, sizes: Map<string, number>) {
  const context = await browser.newContext({
    serviceWorkers: "block",
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(ACTION_TIMEOUT);
  page.setDefaultNavigationTimeout(ACTION_TIMEOUT);
  const ranges = new Map<string, number>();
  const indexes = new Set<string>();
  let fail!: (error: Error) => void;
  const failure = new Promise<never>((_, reject) => {
    fail = reject;
  });
  page.on("pageerror", (error) => fail(new Error(`Uncaught browser error: ${error.message}`)));
  page.on("crash", () => fail(new Error("Browser page crashed")));
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).origin === origin)
      fail(new Error(`Request failed: ${request.url()} (${request.failure()?.errorText})`));
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== origin) return;
    try {
      assert.ok(response.status() < 400, `HTTP ${response.status()}: ${url.pathname}`);
      const size = sizes.get(url.pathname);
      if (size != null) {
        checkRangeResponse(response, size);
        ranges.set(url.pathname, (ranges.get(url.pathname) || 0) + 1);
      }
      if (/\/catalog\.index\.json\.gz$/.test(url.pathname)) {
        assert.equal(response.status(), 200, `${url.pathname} index request failed`);
        indexes.add(url.pathname);
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });

  // Optional web fonts use fallbacks offline; all application/data requests must stay local.
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      (url.hostname === "fonts.googleapis.com" && request.resourceType() === "stylesheet") ||
      (url.hostname === "fonts.gstatic.com" && request.resourceType() === "font")
    ) {
      await route.abort("blockedbyclient");
      return;
    }
    if (["http:", "https:"].includes(url.protocol) && url.origin !== origin) {
      fail(new Error(`Unexpected external request: ${url.href}`));
      await route.abort("blockedbyclient");
    } else await route.continue();
  });

  const journey = async () => {
    stage("Opening HG002 through the sample button");
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Use sample genome HG002/ }).click();
    await page.waitForURL(`${origin}/chapter/1`);
    await page.getByRole("heading", { name: "The file introduces itself", exact: true }).waitFor();
    await page.getByRole("button", { name: "Run this chapter", exact: true }).click();
    await page.getByRole("link", { name: "Next chapter", exact: true }).waitFor();
    assert.match(await page.locator("#reference-build > summary").innerText(), /GRCh38/);

    stage("Chapter 1 completed; preparing Your results");
    await page.getByRole("link", { name: "Just show me my results", exact: true }).click();
    await page.waitForURL(`${origin}/chapter/${RESULTS_STEP + 1}`);
    await page.getByRole("heading", { name: "Your results", exact: true }).waitFor();
    const output = page.locator('.results-output[aria-busy="false"]');
    await output.waitFor();
    const variants = await output
      .locator(".tile")
      .filter({ has: page.getByText("Variants", { exact: true }) })
      .locator(".tv")
      .innerText();
    assert.match(variants, /^[\d,]+$/, "Results must show a numeric variant count");
    assert.ok(Number(variants.replaceAll(",", "")) > 0, "HG002 produced no results");
    await output.locator(".match-row").first().waitFor();
    // Allow asynchronous publication metadata requests triggered by the rendered rows to finish.
    await page.waitForLoadState("networkidle");
    assert.deepEqual([...indexes], ["/ref/GRCh38/catalog.index.json.gz"]);
    assert.ok(ranges.get(SAMPLE.url), "Browser did not request public sample ranges");
    assert.ok(ranges.get("/ref/GRCh38/catalog.tsv.gz"), "Browser did not request catalogue ranges");
    stage(`HG002: ${variants} results; sample and GRCh38 catalogue HTTP 206 responses verified`);
  };
  const visibleError = page
    .waitForFunction(
      () => {
        const error = [...document.querySelectorAll<HTMLElement>('[role="alert"], .err')].find(
          (element) =>
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility !== "hidden",
        );
        return error?.innerText || false;
      },
      undefined,
      { timeout: 0, polling: 250 },
    )
    .then(async (error) => {
      throw new Error(`Visible application error: ${await error.jsonValue()}`);
    });
  await Promise.race([journey(), visibleError, failure]);
}

async function main() {
  const started = Date.now();
  const server = createStaticServer(directory);
  const controller = new AbortController();
  let browser: Browser | undefined;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Browser deployment check exceeded five minutes"));
    }, TOTAL_TIMEOUT);
  });
  try {
    assert.ok(
      fs.existsSync(`${directory}index.html`),
      "Run npm run build first; dist/client/index.html is missing",
    );
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const checks = async () => {
      stage("Serving dist/client and checking both reference builds");
      const sizes = await checkReferences(origin, controller.signal);
      controller.signal.throwIfAborted();
      const launched = await chromium.launch({
        headless: true,
        timeout: Math.min(30_000, Math.max(1, TOTAL_TIMEOUT - (Date.now() - started))),
      });
      if (controller.signal.aborted) {
        await launched.close();
        controller.signal.throwIfAborted();
      }
      browser = launched;
      await checkJourney(browser, origin, sizes);
      await checkTelemetry(browser, origin);
    };
    await Promise.race([checks(), timeout]);
  } finally {
    clearTimeout(timer);
    controller.abort();
    try {
      await browser?.close();
    } finally {
      server.closeAllConnections();
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
    }
  }
}

try {
  await main();
  stage("Predeployment browser check passed");
} catch (error) {
  console.error(`[browser] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
