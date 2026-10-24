import assert from "node:assert/strict";
import type { Browser, Request } from "playwright";
import type { Event } from "@sentry/react";
import { SAMPLE } from "../../src/lib/catalogues/public-sample.ts";

const production = "https://genomewalk.com";
const sentryHost = "o517554.ingest.us.sentry.io";
const sentryPath = "/api/4512309671886848/envelope/";
const secret = "PRIVATE_PROBE_personal-genome.vcf_chr1_12345_A_G";
const isEnvelope = (request: Request) => {
  const url = new URL(request.url());
  return url.hostname === sentryHost && url.pathname === sentryPath;
};

/** Exercise the production SDK against local files; intercepted reports never reach Sentry. */
export async function checkErrorReporting(browser: Browser, origin: string) {
  const context = await browser.newContext({ serviceWorkers: "block", reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const events: Event[] = [];
  const failures: string[] = [];
  let fault: "none" | "sample" | "catalogue" = "none";
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (isEnvelope(request)) {
      try {
        const body = request.postData();
        assert.ok(body, "Error envelope is empty");
        assert.ok(!body.includes(secret), "Error envelope contains private input");
        const parts = body.trim().split("\n");
        assert.equal(parts.length, 3, "Only a single error event may be sent; no attachments");
        const header = JSON.parse(parts[0]!);
        const item = JSON.parse(parts[1]!);
        const event: Event = JSON.parse(parts[2]!);
        assert.equal(item.type, "event", "Unexpected telemetry item");
        assert.ok(!header.trace, "Error envelope contains tracing context");
        assert.equal(event.sdk?.settings?.infer_ip, "never", "Sentry must not infer an event IP");
        for (const key of ["user", "request", "extra", "breadcrumbs", "contexts", "transaction"])
          assert.ok(!(key in event), `Error event contains ${key}`);
        assert.ok(!event.message && !event.logentry, "Error event contains an arbitrary message");
        assert.ok(event.exception?.values?.length, "Error report has no exception");
        for (const exception of event.exception.values) {
          assert.equal(exception.type, "GenomewalkError");
          assert.ok(
            [
              "Network request failed",
              "Invalid byte-range response",
              "Application operation failed",
            ].includes(exception.value || ""),
            "Error report contains an unreviewed exception message",
          );
          for (const frame of exception.stacktrace?.frames || []) {
            assert.match(
              frame.filename || "",
              /^https:\/\/(?:www\.)?genomewalk\.com\/assets\/[\w.-]+\.m?js$/,
            );
            assert.ok(
              Object.keys(frame).every((key) =>
                ["filename", "lineno", "colno", "in_app"].includes(key),
              ),
            );
          }
        }
        const headers = await request.allHeaders();
        assert.ok(!headers["referer"], "Reporting request sends a referrer");
        assert.ok(!headers["cookie"], "Reporting request sends cookies");
        assert.ok(!headers["range"], "Reporting request sends a catalogue range");
        events.push(event);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    if (url.origin === production) {
      if (fault === "sample" && url.pathname === SAMPLE.url) {
        await route.abort("failed");
        return;
      }
      if (fault === "catalogue" && url.pathname === "/ref/GRCh38/catalog.tsv.gz") {
        await route.fulfill({ status: 503, body: "Deliberate catalogue-download failure" });
        return;
      }
      const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}` });
      await route.fulfill({ response });
      return;
    }
    if (
      (url.hostname === "fonts.googleapis.com" && request.resourceType() === "stylesheet") ||
      (url.hostname === "fonts.gstatic.com" && request.resourceType() === "font")
    ) {
      await route.abort("blockedbyclient");
      return;
    }
    failures.push(`Unexpected external request: ${url.hostname}${url.pathname}`);
    await route.abort("blockedbyclient");
  });
  const reportAfter = async (action: () => Promise<unknown>) => {
    const before = events.length;
    await Promise.all([
      page.waitForResponse((response) => isEnvelope(response.request())),
      action(),
    ]);
    assert.deepEqual(failures, []);
    assert.equal(events.length, before + 1, "Expected exactly one report for this failure");
    return events.at(-1)!;
  };
  try {
    await context.addCookies([{ name: "private-probe", value: secret, url: production }]);
    await page.goto(`${production}/?private=${secret}#${secret}`, { waitUntil: "networkidle" });
    assert.deepEqual(failures, []);
    assert.equal(
      events.length,
      0,
      "A healthy page must not send sessions, logs or other telemetry",
    );

    const unhandledError = await reportAfter(() =>
      page.evaluate((privateValue) => {
        document.title = privateValue;
        console.error(privateValue);
        setTimeout(() => {
          throw new Error(privateValue);
        }, 0);
      }, secret),
    );
    assert.equal(unhandledError.tags?.["area"], "unhandled");

    fault = "sample";
    const sampleError = await reportAfter(() =>
      page.getByRole("button", { name: /^Use sample genome HG002/ }).click(),
    );
    assert.equal(sampleError.tags?.["area"], "sample-open");
    assert.equal(sampleError.tags?.["stage"], "read-file");
    await page.getByRole("alert").waitFor();

    fault = "catalogue";
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Use sample genome HG002/ }).click();
    await page.waitForURL(`${production}/chapter/1`);
    await page.getByRole("button", { name: "Run this chapter", exact: true }).click();
    await page.getByRole("link", { name: "Next chapter", exact: true }).waitFor();
    const resultError = await reportAfter(() =>
      page.getByRole("link", { name: "Just show me my results", exact: true }).click(),
    );
    await page.getByRole("alert").waitFor();
    assert.equal(resultError.tags?.["area"], "results");
    assert.equal(resultError.tags?.["stage"], "reference-entries");
    assert.deepEqual(failures, []);
    console.log(
      "[browser] Error reports verified offline: uncaught, sample and results failures; private fields excluded",
    );
  } finally {
    await context.close();
  }
}
