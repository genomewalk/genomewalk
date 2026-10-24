import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../app-error.ts";
import {
  getFileDiagnostics,
  getOpeningFileDiagnostics,
  getSourceFileDiagnostics,
} from "./file-context.ts";

const privateName = "PRIVATE_person_Sample123_diagnosis";

test("file diagnostics retain only recognized suffixes, validated formats and size bands", () => {
  for (const extension of [".vcf.gz", ".vcf.bgz", ".txt", ".tsv", ".zip", ".gz"]) {
    const clean = getFileDiagnostics({ name: privateName + extension.toUpperCase(), size: 99 });
    assert.deepEqual(clean, {
      file_extension: extension,
      file_format: "unknown",
      file_size_band: "under-1-MB",
    });
    assert.ok(!JSON.stringify(clean).includes(privateName));
  }
  for (const name of [privateName, `data.${privateName}`, `${privateName}.vcf.gz.backup`]) {
    const clean = getFileDiagnostics({ name, size: 42_067_644 }, privateName);
    assert.deepEqual(clean, {
      file_extension: "other",
      file_format: "unknown",
      file_size_band: "1-100-MB",
    });
    assert.ok(!JSON.stringify(clean).includes("42067644"));
  }
  assert.equal(getFileDiagnostics(undefined), undefined);
});

test("file sizes use complete decimal bands without exact byte counts", () => {
  for (const [size, band] of [
    [0, "empty"],
    [1, "under-1-MB"],
    [999_999, "under-1-MB"],
    [1_000_000, "1-100-MB"],
    [99_999_999, "1-100-MB"],
    [100_000_000, "100-MB-1-GB"],
    [999_999_999, "100-MB-1-GB"],
    [1_000_000_000, "1-GB-or-more"],
    [9_000_000_000, "1-GB-or-more"],
    [-1, "unknown"],
    [1.5, "unknown"],
    [NaN, "unknown"],
    [Infinity, "unknown"],
    [Number.MAX_SAFE_INTEGER + 1, "unknown"],
  ] as const) {
    assert.equal(getFileDiagnostics({ name: privateName, size })?.file_size_band, band);
  }
});

test("opened source formats come from the reader rather than a misleading filename", () => {
  const file = { name: `${privateName}.txt`, size: 1_000_001 };
  for (const provider of ["23andMe", "AncestryDNA"] as const) {
    assert.equal(getSourceFileDiagnostics({ file, provider })?.file_format, provider);
  }
  assert.equal(getSourceFileDiagnostics({ file, slice() {} })?.file_format, "VCF");
  assert.equal(
    getSourceFileDiagnostics({ file: { ...file, name: "looks-valid.vcf.gz" } })?.file_format,
    "unknown",
  );
  const hostile = getSourceFileDiagnostics({ file, provider: privateName, genotype: "GATTACA" });
  assert.equal(hostile?.file_format, "unknown");
  assert.ok(!JSON.stringify(hostile).includes(privateName));
  assert.ok(!JSON.stringify(hostile).includes("GATTACA"));
  for (const source of [
    null,
    undefined,
    {},
    { file: privateName },
    { file: { name: privateName } },
  ])
    assert.equal(getSourceFileDiagnostics(source), undefined);
});

test("failed opening distinguishes rejected formats from reads that did not identify a format", () => {
  const file = { name: `${privateName}.txt`, size: 300 };
  assert.equal(
    getOpeningFileDiagnostics(file, new AppError("DNA_HEADER_MISSING"))?.file_format,
    "unrecognized",
  );
  assert.equal(
    getOpeningFileDiagnostics(file, new AppError("NETWORK_FAILED"))?.file_format,
    "unknown",
  );
  assert.equal(
    getOpeningFileDiagnostics(file, { code: "DNA_HEADER_MISSING" })?.file_format,
    "unknown",
  );
  assert.equal(
    getOpeningFileDiagnostics(undefined, new AppError("FILE_SELECTION_INVALID")),
    undefined,
  );
});

test("each operation gets its own metadata with no previous-file state", () => {
  const first = getSourceFileDiagnostics({
    file: { name: `${privateName}.zip`, size: 25_000_000 },
    provider: "23andMe",
  });
  const second = getOpeningFileDiagnostics(
    { name: "different.txt", size: 200 },
    new AppError("DNA_HEADER_MISSING"),
  );
  assert.deepEqual(second, {
    file_extension: ".txt",
    file_format: "unrecognized",
    file_size_band: "under-1-MB",
  });
  assert.deepEqual(first, {
    file_extension: ".zip",
    file_format: "23andMe",
    file_size_band: "1-100-MB",
  });
  assert.equal(getSourceFileDiagnostics(null), undefined);
});
