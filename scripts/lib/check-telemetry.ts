import assert from "node:assert/strict";
import { gzipSync, zipSync, strToU8 } from "fflate";
import type { Browser, Request } from "playwright";
import { SAMPLE } from "../../src/lib/catalogues/public-sample.ts";
import { errorDefinitions, errorResources, type ErrorCode } from "../../src/lib/app-error.ts";

type Event = {
  event: string;
  properties: Record<string, unknown>;
  uuid?: string;
  timestamp?: string;
};
const production = "https://genomewalk.com";
const ingest = "https://us.i.posthog.com";
const secret = "PRIVATE_PROBE_personal-genome.vcf_chr1_12345_A_G";
const isTelemetry = (request: Request) => new URL(request.url()).origin === ingest;
const usageNames = new Set([
  "genome_open_started",
  "genome_opened",
  "genome_open_failed",
  "genome_ready",
  "build_choice_shown",
  "build_choice_confirmed",
  "build_choice_cancelled",
  "chapter_run_started",
  "chapter_run_completed",
  "chapter_run_failed",
  "results_started",
  "results_completed",
  "results_failed",
  "explanation_opened",
]);

/** Real production SDK, local app/data, intercepted ingestion: no CI events leave the machine. */
export async function checkTelemetry(browser: Browser, origin: string) {
  const context = await browser.newContext({
    serviceWorkers: "block",
    reducedMotion: "reduce",
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/143.0.7337.123 Safari/537.36 ${secret}`,
  });
  // Simulate a human browser in this isolated test; the SDK intentionally ignores WebDriver.
  // Every network request is intercepted below, so this never bypasses a live service's checks.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "userAgentData", { get: () => undefined });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const events: Event[] = [];
  const failures: string[] = [];
  let fault: "none" | "sample-network" | "sample-range" | "catalogue-index" | "catalogue" = "none";
  const exceptions = () => events.filter((event) => event.event === "$exception");
  const count = (name: string, source?: string) =>
    events.filter(
      (event) => event.event === name && (!source || event.properties["source"] === source),
    ).length;

  function validate(event: Event) {
    assert.ok(
      Object.keys(event).every((key) => ["uuid", "event", "properties", "timestamp"].includes(key)),
      "Unexpected event field",
    );
    assert.ok(
      event.event === "$pageview" || event.event === "$exception" || usageNames.has(event.event),
      `Unexpected event ${event.event}`,
    );
    const p = event.properties;
    const common = [
      "token",
      "distinct_id",
      "$session_id",
      "$process_person_profile",
      "$geoip_disable",
      "environment",
      "release",
      "browser_name",
      "browser_major",
      "os_name",
      "device_type",
    ];
    const usage = ["source", "chapter"];
    const error = [
      "area",
      "stage",
      "category",
      "error_code",
      "resource",
      "public_file",
      "http_status",
      "chapter",
      "file_extension",
      "file_format",
      "file_size_band",
      "header_provider",
      "header_layout",
      "format_reason",
      "reader_kind",
      "reading_step",
      "input_container",
      "text_encoding",
      "failure_reason",
      "$exception_list",
      "$exception_level",
      "$exception_fingerprint",
    ];
    const allowed = new Set([
      ...common,
      ...(event.event === "$exception"
        ? error
        : event.event === "$pageview"
          ? ["$current_url", "$pathname"]
          : usage),
    ]);
    assert.ok(
      Object.keys(p).every((key) => allowed.has(key)),
      `Unexpected properties: ${Object.keys(p)
        .filter((key) => !allowed.has(key))
        .join(", ")}`,
    );
    assert.equal(p["environment"], "production");
    assert.equal(p["$process_person_profile"], false);
    assert.equal(p["$geoip_disable"], true);
    assert.match(String(p["distinct_id"]), /^[\w-]{16,64}$/);
    assert.equal(p["browser_name"], "Chrome");
    assert.equal(p["browser_major"], "143");
    assert.equal(p["os_name"], "Linux");
    assert.equal(p["device_type"], "desktop");
    if (p["chapter"] !== undefined)
      assert.ok(
        Number.isInteger(p["chapter"]) && Number(p["chapter"]) >= 1 && Number(p["chapter"]) <= 9,
      );
    if (event.event === "$pageview") {
      assert.match(
        String(p["$current_url"]),
        /^https:\/\/genomewalk\.com\/(?:chapter\/[1-9]|privacy|terms)?$/,
      );
      return;
    }
    if (event.event !== "$exception") {
      if (p["source"] !== undefined) assert.ok(["upload", "sample"].includes(String(p["source"])));
      return;
    }
    assert.ok(
      typeof p["error_code"] === "string" && Object.hasOwn(errorDefinitions, p["error_code"]),
    );
    const [message, category, level] = errorDefinitions[p["error_code"] as ErrorCode];
    assert.equal(p["category"], category);
    assert.equal(
      p["$exception_level"],
      category === "validation" && p["area"] === "sample-open" ? "error" : level,
    );
    assert.ok(Array.isArray(p["$exception_list"]) && p["$exception_list"].length === 1);
    const exception = p["$exception_list"][0];
    assert.equal(exception.type, p["error_code"]);
    assert.equal(exception.value, message);
    assert.deepEqual(exception.mechanism, { type: "generic", handled: p["area"] !== "unhandled" });
    assert.ok(
      Object.keys(exception).every((key) =>
        ["type", "value", "stacktrace", "mechanism"].includes(key),
      ),
    );
    for (const frame of exception.stacktrace?.frames || []) {
      assert.equal(frame.function, "<anonymous>");
      assert.match(
        frame.filename || "",
        /^https:\/\/(?:www\.)?genomewalk\.com\/assets\/[\w.-]+\.m?js$/,
      );
      assert.ok(
        Object.keys(frame).every((key) =>
          ["filename", "lineno", "colno", "in_app", "platform", "function"].includes(key),
        ),
      );
    }
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
      ].includes(String(p["area"])),
    );
    assert.ok(
      ["prepare", "read-file", "reference-index", "reference-entries"].includes(String(p["stage"])),
    );
    assert.ok(
      p["resource"] === undefined || errorResources.some((value) => value === p["resource"]),
    );
    if (p["public_file"] !== undefined) {
      const publicFiles: Record<string, string[]> = {
        "public-sample": ["/samples/HG002_GRCh38.vcf.gz"],
        "catalogue-index": [
          "/ref/GRCh37/catalog.index.json.gz",
          "/ref/GRCh38/catalog.index.json.gz",
        ],
        "catalogue-entries": ["/ref/GRCh37/catalog.tsv.gz", "/ref/GRCh38/catalog.tsv.gz"],
        "consumer-lookup": [
          "/ref/consumer-dna/GRCh37/rsids.json.gz",
          "/ref/consumer-dna/GRCh38/rsids.json.gz",
        ],
        markers: ["/ref/GRCh37/markers.json", "/ref/GRCh38/markers.json"],
        "publication-index": ["/ref/publications/index.json"],
        "publication-labels": ["/ref/publications/[shard].json.gz"],
      };
      assert.ok(publicFiles[String(p["resource"])]?.includes(String(p["public_file"])));
    }
    assert.ok(
      p["http_status"] === undefined ||
        (p["resource"] &&
          Number.isInteger(p["http_status"]) &&
          Number(p["http_status"]) >= 100 &&
          Number(p["http_status"]) <= 599),
    );
    if (p["file_extension"] !== undefined) {
      assert.ok(
        [
          ".vcf.gz",
          ".vcf.bgz",
          ".gvcf.gz",
          ".gvcf.bgz",
          ".fastq.gz",
          ".fasta.gz",
          ".csv.gz",
          ".fq.gz",
          ".fa.gz",
          ".gvcf",
          ".vcf",
          ".fastq",
          ".fasta",
          ".bam",
          ".cram",
          ".csv",
          ".fq",
          ".fa",
          ".txt",
          ".tsv",
          ".zip",
          ".gz",
          ".bgz",
          "other",
        ].includes(String(p["file_extension"])),
      );
      assert.ok(
        ["VCF", "23andMe", "AncestryDNA", "unrecognized", "unknown"].includes(
          String(p["file_format"]),
        ),
      );
      assert.ok(
        ["empty", "under-1-MB", "1-100-MB", "100-MB-1-GB", "1-GB-or-more", "unknown"].includes(
          String(p["file_size_band"]),
        ),
      );
    }
    for (const [key, values] of [
      ["header_provider", ["23andMe", "AncestryDNA", "unrecognized"]],
      ["header_layout", ["genotype", "allele-pair", "other"]],
      ["format_reason", ["provider-unrecognized", "columns-mismatch"]],
      ["reader_kind", ["consumer-dna", "vcf"]],
      [
        "reading_step",
        [
          "format-detection",
          "read-bytes",
          "archive-directory",
          "decompress",
          "archive-integrity",
          "select-payload",
          "header",
          "first-record",
          "records",
        ],
      ],
      ["input_container", ["plain", "zip", "gzip", "bgzf"]],
      ["text_encoding", ["utf8-bom", "utf16le-bom", "utf16be-bom", "unmarked"]],
      [
        "failure_reason",
        [
          "header-ended-before-columns",
          "data-before-columns",
          "row-columns-too-few",
          "row-columns-too-many",
          "archive-end-missing",
          "directory-invalid",
          "directory-mismatch",
          "duplicate-entry",
          "split-or-zip64",
          "compression-unsupported",
          "decompression-failed",
          "payload-incomplete",
          "checksum-mismatch",
          "decoded-size-mismatch",
          "bgzf-signature-missing",
          "bgzf-extra-field-missing",
          "bgzf-header-incomplete",
          "bgzf-block-size-invalid",
          "decoded-size-invalid",
          "vcf-format-marker-missing",
          "vcf-column-header-missing",
        ],
      ],
    ] as const) {
      if (p[key] === undefined) continue;
      assert.ok(values.some((value) => value === p[key]));
    }
  }

  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (isTelemetry(request)) {
      try {
        assert.equal(url.pathname, "/e/", `Only event ingestion may be requested: ${url.pathname}`);
        assert.equal(request.method(), "POST");
        const body = request.postData();
        assert.ok(body, "Empty telemetry body");
        assert.ok(!body.includes(secret), "Telemetry contains private input");
        assert.ok(!body.includes("7337.123"), "Full browser version must not be included");
        const decoded = JSON.parse(body);
        assert.deepEqual(Object.keys(decoded).sort(), ["api_key", "batch", "sent_at"]);
        assert.ok(Array.isArray(decoded.batch), "Expected the SDK's event batch envelope");
        const batch = decoded.batch;
        for (const event of batch) {
          validate(event);
          events.push(event);
        }
        const headers = await request.allHeaders();
        assert.ok(!headers["referer"], "Telemetry sends a referrer");
        assert.ok(!headers["cookie"], "Telemetry sends cookies");
        assert.ok(!headers["range"], "Telemetry sends a catalogue range");
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": production },
        body: '{"status":1}',
      });
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
      if (
        (fault === "catalogue-index" && url.pathname === "/ref/GRCh38/catalog.index.json.gz") ||
        (fault === "catalogue" && url.pathname === "/ref/GRCh38/catalog.tsv.gz")
      ) {
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
  async function settled() {
    await page.waitForLoadState("networkidle");
    assert.deepEqual(failures, []);
  }
  async function reportAfter(action: () => Promise<unknown>) {
    const before = exceptions().length;
    await Promise.all([
      page.waitForResponse((response) => {
        const request = response.request();
        return (
          isTelemetry(request) && request.postData()?.includes('"event":"$exception"') === true
        );
      }),
      action(),
    ]);
    await settled();
    assert.equal(exceptions().length, before + 1, "Expected one sanitized report");
    return exceptions().at(-1)!.properties;
  }
  async function checkMemoryOnly() {
    const stored = await page.evaluate(() => ({
      cookies: document.cookie,
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }));
    assert.ok(
      !/ph_|posthog/i.test(JSON.stringify(stored)),
      "Analytics identity persisted in browser storage",
    );
  }
  try {
    await context.addCookies([{ name: "private-probe", value: secret, url: production }]);
    await page.goto(`${production}/?private=${secret}#${secret}`, { waitUntil: "networkidle" });
    await settled();
    assert.deepEqual(
      events.map((event) => event.event),
      ["$pageview"],
      "Healthy landing emits one curated page view",
    );
    const firstIdentity = events[0]!.properties["distinct_id"];
    await checkMemoryOnly();
    const unhandled = await reportAfter(() =>
      page.evaluate((value) => {
        document.title = value;
        console.error(value);
        setTimeout(() => {
          throw new Error(value);
        }, 0);
      }, secret),
    );
    assert.equal(unhandled["area"], "unhandled");
    assert.equal(unhandled["error_code"], "UNEXPECTED_ERROR");
    assert.equal(unhandled["file_extension"], undefined);

    const uploadInvalid = () =>
      page.locator('input[type="file"]').setInputFiles({
        name: `${secret}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from(`# Synthetic invalid file\n${secret}\n`),
      });
    const waitForFileError = () =>
      page.waitForFunction(() => {
        const button = [...document.querySelectorAll("button")].find((candidate) =>
          candidate.textContent?.includes("Choose genome file"),
        );
        return button && !button.disabled && document.querySelector('[role="alert"]');
      });
    const invalid = await reportAfter(uploadInvalid);
    assert.equal(invalid["area"], "file-open");
    assert.equal(invalid["stage"], "read-file");
    assert.equal(invalid["error_code"], "DNA_HEADER_MISSING");
    assert.equal(invalid["$exception_level"], "warning");
    assert.equal(invalid["file_extension"], ".txt");
    assert.equal(invalid["file_format"], "unrecognized");
    assert.equal(invalid["file_size_band"], "under-1-MB");
    await waitForFileError();
    const errorCount = exceptions().length;
    for (let attempt = 0; attempt < 12; attempt++) {
      await uploadInvalid();
      await waitForFileError();
    }
    await settled();
    assert.equal(
      exceptions().length,
      errorCount,
      "Repeated validation failures should not duplicate issues",
    );
    assert.equal(
      count("genome_open_started", "upload"),
      13,
      "Actual file attempts must all be counted",
    );
    assert.equal(count("genome_open_failed", "upload"), 13);
    assert.equal(count("genome_ready", "upload"), 0);

    fault = "sample-network";
    const sample = await reportAfter(() =>
      page.getByRole("button", { name: /^Use sample genome HG002/ }).click(),
    );
    assert.equal(sample["error_code"], "NETWORK_FAILED");
    assert.equal(sample["resource"], "public-sample");
    assert.equal(sample["public_file"], "/samples/HG002_GRCh38.vcf.gz");
    assert.equal(sample["file_extension"], ".vcf.gz");
    assert.equal(sample["file_format"], "unknown");
    assert.equal(sample["file_size_band"], "1-100-MB");
    assert.equal(sample["$exception_level"], "error");
    fault = "sample-range";
    const range = await reportAfter(() =>
      page.getByRole("button", { name: /^Use sample genome HG002/ }).click(),
    );
    assert.equal(range["error_code"], "RANGE_RESPONSE_INVALID");
    assert.equal(range["http_status"], 200);
    assert.equal(range["public_file"], "/samples/HG002_GRCh38.vcf.gz");
    assert.equal(count("genome_open_failed", "sample"), 2);
    assert.ok(
      events.every((event) => event.properties["distinct_id"] === firstIdentity),
      "Identity must remain stable in one page session",
    );

    fault = "catalogue-index";
    await page.reload({ waitUntil: "networkidle" });
    assert.notEqual(
      events.at(-1)!.properties["distinct_id"],
      firstIdentity,
      "Reload must start a fresh identity",
    );
    await page.getByRole("button", { name: /^Use sample genome HG002/ }).click();
    await page.waitForURL(`${production}/chapter/1`);
    await page.getByRole("button", { name: "Run this chapter", exact: true }).click();
    await page.getByRole("link", { name: "Next chapter", exact: true }).waitFor();
    await page.getByRole("link", { name: /^Chapter 8:/ }).click();
    await page.waitForURL(`${production}/chapter/8`);
    const chapter = await reportAfter(() =>
      page.getByRole("button", { name: "Run this chapter", exact: true }).click(),
    );
    assert.equal(chapter["area"], "chapter");
    assert.equal(chapter["stage"], "reference-index");
    assert.equal(chapter["chapter"], 8);
    assert.equal(chapter["resource"], "catalogue-index");
    assert.equal(chapter["public_file"], "/ref/GRCh38/catalog.index.json.gz");
    assert.equal(chapter["http_status"], 503);
    assert.equal(chapter["file_format"], "VCF");
    assert.equal(count("chapter_run_completed"), 1);
    assert.equal(count("chapter_run_failed"), 1);
    fault = "catalogue";
    const result = await reportAfter(() =>
      page.getByRole("link", { name: "Just show me my results", exact: true }).click(),
    );
    assert.equal(result["area"], "results");
    assert.equal(result["stage"], "reference-entries");
    assert.equal(result["error_code"], "HTTP_ERROR");
    assert.equal(result["resource"], "catalogue-entries");
    assert.equal(result["public_file"], "/ref/GRCh38/catalog.tsv.gz");
    assert.equal(result["http_status"], 503);
    assert.equal(result["file_format"], "VCF");
    assert.equal(count("genome_opened", "sample"), 1);
    assert.equal(count("genome_ready", "sample"), 1);
    assert.equal(count("results_started"), 1);
    assert.equal(count("results_failed"), 1);
    // A successful sample journey must also produce completion events, without result data.
    fault = "none";
    await page.goto(production, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Use sample genome HG002/ }).click();
    await page.waitForURL(`${production}/chapter/1`);
    await page.getByRole("button", { name: "Run this chapter", exact: true }).click();
    await page.getByRole("link", { name: "Next chapter", exact: true }).waitFor();
    await page.locator("#reference-build > summary").click();
    await settled();
    assert.equal(count("explanation_opened"), 1);
    await page.getByRole("link", { name: "Just show me my results", exact: true }).click();
    await page.locator('.results-output[aria-busy="false"] .match-row').first().waitFor();
    await settled();
    assert.equal(count("results_completed"), 1);
    assert.equal(count("results_started"), 2);
    assert.equal(count("chapter_run_completed"), 2);
    const beforeResultDisclosure = events.length;
    await page.locator(".match-row > summary").first().click();
    await settled();
    assert.equal(
      events.length,
      beforeResultDisclosure,
      "Personal result disclosures must not be tracked",
    );

    // Unknown-build intake: reading a file is distinct from making it ready for chapters.
    await page.goto(production, { waitUntil: "networkidle" });
    const unknownBuild = () =>
      page.locator('input[type="file"]').setInputFiles({
        name: `${secret}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from(
          `# Synthetic 23andMe raw data\n# ${secret}\nrsid\tchromosome\tposition\tgenotype\nrsSynthetic1\t1\t100\tAG\n`,
        ),
      });
    await unknownBuild();
    await page
      .getByRole("heading", { name: "Which reference build does this file use?" })
      .waitFor();
    await settled();
    assert.equal(count("build_choice_shown"), 1);
    assert.equal(count("genome_opened", "upload"), 1);
    assert.equal(count("genome_ready", "upload"), 0);
    await page.getByRole("button", { name: "Back to file selection" }).click();
    await unknownBuild();
    await page.getByRole("radio", { name: "Another build / I’m not sure" }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL(`${production}/chapter/1`);
    await page.getByRole("button", { name: "Run this chapter", exact: true }).click();
    await page.getByRole("link", { name: "Next chapter", exact: true }).waitFor();
    await settled();
    assert.equal(count("build_choice_shown"), 2);
    assert.equal(count("build_choice_cancelled"), 1);
    assert.equal(count("build_choice_confirmed"), 1);
    assert.equal(count("genome_ready", "upload"), 1);
    assert.equal(count("chapter_run_completed", "upload"), 1);

    // Exercise catchable capacity failures without exhausting memory. The hook
    // rejects only the next Blob read, so the same page can recover normally.
    const uploadValid = () =>
      page.locator('input[type="file"]').setInputFiles({
        name: `${secret}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from(
          `# Synthetic 23andMe raw data\n# reference assembly build 37; plus strand\n# ${secret}\n# rsid\tchromosome\tposition\tgenotype\nrs100\t1\t100\tCT\n`,
        ),
      });
    for (const [message, code] of [
      ["Array buffer allocation failed", "BROWSER_ALLOCATION_FAILED"],
      ["Invalid array length", "JS_RANGE_ERROR"],
    ] as const) {
      await page.goto(production, { waitUntil: "networkidle" });
      await page.evaluate((message) => {
        const original = Blob.prototype.arrayBuffer;
        let failNextRead = true;
        Blob.prototype.arrayBuffer = function () {
          if (failNextRead) {
            failNextRead = false;
            return Promise.reject(new RangeError(message));
          }
          return original.call(this);
        };
      }, message);
      const readyBefore = count("genome_ready", "upload");
      const failedBefore = count("genome_open_failed", "upload");
      const failure = await reportAfter(uploadValid);
      assert.equal(failure["error_code"], code);
      assert.equal(failure["area"], "file-open");
      assert.equal(failure["stage"], "read-file");
      assert.equal(failure["$exception_level"], "error");
      assert.equal(failure["file_extension"], ".txt");
      assert.equal(failure["file_format"], "unknown");
      assert.equal(failure["file_size_band"], "under-1-MB");
      assert.equal(count("genome_open_failed", "upload"), failedBefore + 1);
      assert.equal(count("genome_ready", "upload"), readyBefore);
      await waitForFileError();
      const alert = await page.getByRole("alert").innerText();
      if (code === "BROWSER_ALLOCATION_FAILED") {
        assert.match(alert, /Your browser could not allocate enough memory to continue/);
        assert.match(alert, /Close other tabs and try again/);
      } else {
        assert.doesNotMatch(alert, /memory|too large|size limit/i);
      }
      await uploadValid();
      await page.waitForURL(`${production}/chapter/1`);
      await page.getByRole("button", { name: "Run this chapter", exact: true }).click();
      await page.getByRole("link", { name: "Next chapter", exact: true }).waitFor();
      await settled();
      assert.equal(count("genome_ready", "upload"), readyBefore + 1);
      assert.equal(await page.getByRole("alert").count(), 0);
    }
    // Fixed header categories identify the rejection without transmitting the
    // provider comment, arbitrary column labels, file name or a DNA row.
    await page.goto(production, { waitUntil: "networkidle" });
    for (const [meta, columns, provider, layout, reason] of [
      [
        `# ${secret}`,
        "rsid\tchromosome\tposition\tgenotype",
        "unrecognized",
        "genotype",
        "provider-unrecognized",
      ],
      [
        "# 23andMe",
        "rsid\tchromosome\tposition\tallele1\tallele2",
        "23andMe",
        "allele-pair",
        "columns-mismatch",
      ],
      [
        "# AncestryDNA",
        `rsid\tchromosome\tposition\t${secret}`,
        "AncestryDNA",
        "other",
        "columns-mismatch",
      ],
    ]) {
      const failure = await reportAfter(() =>
        page.locator('input[type="file"]').setInputFiles({
          name: `${secret}.txt`,
          mimeType: "text/plain",
          buffer: Buffer.from(`${meta}\n# ${columns}\n${secret}\n`),
        }),
      );
      assert.equal(failure["error_code"], "DNA_FORMAT_UNSUPPORTED");
      assert.equal(failure["header_provider"], provider);
      assert.equal(failure["header_layout"], layout);
      assert.equal(failure["format_reason"], reason);
      await waitForFileError();
      const alert = await page.getByRole("alert").innerText();
      assert.match(
        alert,
        reason === "provider-unrecognized"
          ? /identify a supported provider/
          : /columns don’t match/,
      );
      assert.ok(!alert.includes(secret));
    }
    const corruptGzip = gzipSync(strToU8(`# ${secret}\n`));
    corruptGzip[corruptGzip.length - 8]! ^= 1;
    const readFailures = [
      {
        extension: ".txt",
        bytes: strToU8(
          `#AncestryDNA raw data\n# ${secret}\nrsid\tchromosome\tposition\tallele1\tallele2\n${secret}\t1\t100\tA\n`,
        ),
        expected: {
          error_code: "DNA_COLUMNS_INVALID",
          header_provider: "AncestryDNA",
          reading_step: "first-record",
          input_container: "plain",
          failure_reason: "row-columns-too-few",
        },
      },
      {
        extension: ".txt",
        bytes: strToU8(`\uFEFF#23andMe\n# ${secret}\n`),
        expected: {
          error_code: "DNA_HEADER_MISSING",
          header_provider: "23andMe",
          failure_reason: "header-ended-before-columns",
          text_encoding: "utf8-bom",
        },
      },
      {
        extension: ".zip",
        bytes: zipSync({
          [`${secret}.txt`]: strToU8(
            `#23andMe\n# ${secret}\nrsid\tchromosome\tposition\tallele1\tallele2\n`,
          ),
        }),
        expected: {
          error_code: "ARCHIVE_NO_DNA",
          header_provider: "23andMe",
          input_container: "zip",
          format_reason: "columns-mismatch",
        },
      },
      {
        extension: ".gz",
        bytes: corruptGzip,
        expected: {
          error_code: "ARCHIVE_INVALID",
          input_container: "gzip",
          failure_reason: "checksum-mismatch",
          reading_step: "archive-integrity",
        },
      },
      {
        extension: ".bam",
        bytes: strToU8(secret),
        expected: {
          error_code: "FILE_TYPE_UNSUPPORTED",
          file_extension: ".bam",
          reading_step: "format-detection",
        },
      },
    ];
    for (const { extension, bytes, expected } of readFailures) {
      await page.goto(production, { waitUntil: "networkidle" });
      const failure = await reportAfter(() =>
        page.locator('input[type="file"]').setInputFiles({
          name: `${secret}${extension}`,
          mimeType: "application/octet-stream",
          buffer: Buffer.from(bytes),
        }),
      );
      for (const [key, value] of Object.entries(expected)) assert.equal(failure[key], value, key);
      await waitForFileError();
    }
    await checkMemoryOnly();
    assert.deepEqual(failures, []);
    console.log(
      "[browser] PostHog verified offline: curated journey counts, sanitized errors and allocation-failure recovery, no personal data, no persisted identity or unused SDK requests",
    );
  } finally {
    await context.close();
  }
}
