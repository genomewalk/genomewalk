import assert from "node:assert/strict";
import type { Browser, Request } from "playwright";
import type { Event } from "@sentry/react";
import { SAMPLE } from "../../src/lib/catalogues/public-sample.ts";
import { errorDefinitions, errorResources, type ErrorCode } from "../../src/lib/app-error.ts";

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
  let fault: "none" | "sample-network" | "sample-range" | "catalogue-index" | "catalogue" = "none";
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
        const eventKeys = new Set([
          "event_id",
          "timestamp",
          "level",
          "platform",
          "environment",
          "release",
          "tags",
          "fingerprint",
          "exception",
          "sdk",
        ]);
        assert.ok(
          Object.keys(event).every((key) => eventKeys.has(key)),
          "Unexpected error event field",
        );
        for (const key of ["user", "request", "extra", "breadcrumbs", "contexts", "transaction"])
          assert.ok(!(key in event), `Error event contains ${key}`);
        assert.ok(!event.message && !event.logentry, "Error event contains an arbitrary message");
        assert.equal(
          event.exception?.values?.length,
          1,
          "Report must contain one sanitized exception",
        );
        for (const exception of event.exception!.values!) {
          assert.ok(
            exception.type && Object.hasOwn(errorDefinitions, exception.type),
            "Unknown error code",
          );
          const code = exception.type as ErrorCode;
          const [message, category, level] = errorDefinitions[code];
          assert.equal(
            exception.value,
            message,
            "Error report contains an unreviewed exception message",
          );
          assert.equal(
            event.level,
            category === "validation" && event.tags?.["area"] === "sample-open" ? "error" : level,
          );
          assert.equal(event.tags?.["category"], category);
          assert.equal(event.tags?.["error_code"], code);
          assert.ok(
            Object.keys(exception).every((key) => ["type", "value", "stacktrace"].includes(key)),
          );
          const tagKeys = new Set([
            "area",
            "stage",
            "category",
            "error_code",
            "resource",
            "http_status",
            "chapter",
          ]);
          assert.ok(
            Object.keys(event.tags || {}).every((key) => tagKeys.has(key)),
            "Unexpected error tag",
          );
          const area = event.tags?.["area"];
          const resource = event.tags?.["resource"];
          assert.ok(
            [
              "file-open",
              "sample-open",
              "build-choice",
              "chapter",
              "results",
              "page",
              "unhandled",
              "publications",
              "illustration",
            ].includes(String(area)),
          );
          assert.ok(
            ["prepare", "read-file", "reference-index", "reference-entries"].includes(
              String(event.tags?.["stage"]),
            ),
          );
          assert.ok(resource === undefined || errorResources.some((value) => value === resource));
          const status = event.tags?.["http_status"];
          assert.ok(
            status === undefined ||
              (resource &&
                typeof status === "number" &&
                Number.isInteger(status) &&
                status >= 100 &&
                status <= 599),
          );
          const chapter = event.tags?.["chapter"];
          assert.ok(
            chapter === undefined ||
              (typeof chapter === "number" &&
                Number.isInteger(chapter) &&
                chapter >= 1 &&
                chapter <= 9),
          );
          assert.deepEqual(
            event.fingerprint,
            code === "UNEXPECTED_ERROR" || code.startsWith("JS_")
              ? ["{{ default }}", area]
              : ["genomewalk", code, area, resource || "none"],
            "Issue grouping must contain only reviewed diagnostic values",
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
      if (fault === "sample-network" && url.pathname === SAMPLE.url) {
        await route.abort("failed");
        return;
      }
      if (fault === "sample-range" && url.pathname === SAMPLE.url) {
        await route.fulfill({ status: 200, body: secret });
        return;
      }
      if (fault === "catalogue-index" && url.pathname === "/ref/GRCh38/catalog.index.json.gz") {
        await route.fulfill({ status: 503, body: secret });
        return;
      }
      if (fault === "catalogue" && url.pathname === "/ref/GRCh38/catalog.tsv.gz") {
        await route.fulfill({ status: 503, body: secret });
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
    assert.equal(unhandledError.tags?.["error_code"], "UNEXPECTED_ERROR");

    const uploadInvalidFile = () =>
      page.locator('input[type="file"]').setInputFiles({
        name: `${secret}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from(`# Synthetic invalid file\n${secret}\n`),
      });
    const waitForFileError = async () => {
      await page.waitForFunction(() => {
        const button = [...document.querySelectorAll("button")].find((candidate) =>
          candidate.textContent?.includes("Choose genome file"),
        );
        return button && !button.disabled && document.querySelector('[role="alert"]');
      });
    };
    const invalidFileError = await reportAfter(uploadInvalidFile);
    assert.equal(invalidFileError.tags?.["area"], "file-open");
    assert.equal(invalidFileError.tags?.["stage"], "read-file");
    assert.equal(invalidFileError.tags?.["error_code"], "DNA_HEADER_MISSING");
    assert.equal(
      invalidFileError.exception?.values?.[0]?.value,
      "Unsupported DNA file: expected header missing",
    );
    assert.equal(invalidFileError.level, "warning");
    await waitForFileError();

    const beforeRepeatedFiles = events.length;
    for (let attempt = 0; attempt < 12; attempt++) {
      await uploadInvalidFile();
      await waitForFileError();
    }
    await page.waitForLoadState("networkidle");
    assert.deepEqual(failures, []);
    assert.equal(
      events.length,
      beforeRepeatedFiles,
      "Repeated invalid files must not send duplicate warnings",
    );

    fault = "sample-network";
    const sampleError = await reportAfter(() =>
      page.getByRole("button", { name: /^Use sample genome HG002/ }).click(),
    );
    assert.equal(sampleError.tags?.["area"], "sample-open");
    assert.equal(sampleError.tags?.["stage"], "read-file");
    assert.equal(sampleError.tags?.["error_code"], "NETWORK_FAILED");
    assert.equal(sampleError.tags?.["resource"], "public-sample");
    assert.equal(
      sampleError.level,
      "error",
      "Validation warnings must not exhaust the error reporting limit",
    );
    await page.getByRole("alert").waitFor();

    fault = "sample-range";
    const rangeError = await reportAfter(() =>
      page.getByRole("button", { name: /^Use sample genome HG002/ }).click(),
    );
    assert.equal(rangeError.tags?.["area"], "sample-open");
    assert.equal(rangeError.tags?.["error_code"], "RANGE_RESPONSE_INVALID");
    assert.equal(rangeError.tags?.["resource"], "public-sample");
    assert.equal(rangeError.tags?.["http_status"], 200);
    await page.getByRole("alert").waitFor();

    fault = "catalogue-index";
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Use sample genome HG002/ }).click();
    await page.waitForURL(`${production}/chapter/1`);
    await page.getByRole("button", { name: "Run this chapter", exact: true }).click();
    await page.getByRole("link", { name: "Next chapter", exact: true }).waitFor();
    await page.getByRole("link", { name: /^Chapter 8:/ }).click();
    await page.waitForURL(`${production}/chapter/8`);
    const chapterError = await reportAfter(() =>
      page.getByRole("button", { name: "Run this chapter", exact: true }).click(),
    );
    await page.getByRole("alert").waitFor();
    assert.equal(chapterError.tags?.["area"], "chapter");
    assert.equal(chapterError.tags?.["stage"], "reference-index");
    assert.equal(chapterError.tags?.["chapter"], 8);
    assert.equal(chapterError.tags?.["error_code"], "HTTP_ERROR");
    assert.equal(chapterError.tags?.["resource"], "catalogue-index");
    assert.equal(chapterError.tags?.["http_status"], 503);

    fault = "catalogue";
    const resultError = await reportAfter(() =>
      page.getByRole("link", { name: "Just show me my results", exact: true }).click(),
    );
    await page.getByRole("alert").waitFor();
    assert.equal(resultError.tags?.["area"], "results");
    assert.equal(resultError.tags?.["stage"], "reference-entries");
    assert.equal(resultError.tags?.["error_code"], "HTTP_ERROR");
    assert.equal(resultError.tags?.["resource"], "catalogue-entries");
    assert.equal(resultError.tags?.["http_status"], 503);
    assert.deepEqual(failures, []);
    console.log(
      "[browser] Error reports verified offline: uncaught, invalid file deduplication, sample network/range, chapter and results failures; private fields excluded",
    );
  } finally {
    await context.close();
  }
}
