import assert from "node:assert/strict";
import test from "node:test";
import type { ErrorResource } from "./app-error.ts";
import { safePublicFile } from "./public-file.ts";

test("public file identifiers cover the reviewed downloads and strip URL parameters", () => {
  const files: [ErrorResource, string][] = [
    ["public-sample", "/samples/HG002_GRCh38.vcf.gz"],
    ["publication-index", "/ref/publications/index.json"],
  ];
  for (const build of ["GRCh37", "GRCh38"])
    files.push(
      ["catalogue-index", `/ref/${build}/catalog.meta.json`],
      ["catalogue-entries", `/ref/${build}/catalog.tsv.gz`],
      ["markers", `/ref/${build}/markers.json`],
      ["consumer-lookup", `/ref/consumer-dna/${build}/rsids.json.gz`],
    );
  for (const [resource, path] of files) {
    assert.equal(safePublicFile(path, resource), path);
    assert.equal(safePublicFile(`https://genomewalk.com${path}?v=PRIVATE#PRIVATE`, resource), path);
    assert.equal(safePublicFile(new URL(`https://www.genomewalk.com${path}`), resource), path);
    assert.equal(safePublicFile(new Request(`https://genomewalk.com${path}`), resource), path);
  }
});

test("public file identifiers reject unknown origins, paths and resource mismatches", () => {
  const path = "/ref/GRCh38/catalog.meta.json";
  for (const input of [
    `https://example.com${path}`,
    `https://genomewalk.com.example.com${path}`,
    `https://user:password@genomewalk.com${path}`,
    `http://genomewalk.com${path}`,
    `//genomewalk.com${path}`,
    `/private/..${path}`,
    `/ref/GRCh%33%38/catalog.meta.json`,
    `/ref/GRCh38/PRIVATE_GENOME.vcf.gz`,
    `/ref/PRIVATE/catalog.meta.json`,
    `/ref/GRCh38/catalog.meta.json/PRIVATE`,
    `blob:https://genomewalk.com${path}`,
  ])
    assert.equal(safePublicFile(input, "catalogue-index"), undefined, input);
  assert.equal(safePublicFile(path, "catalogue-entries"), undefined);
  assert.equal(safePublicFile(path, undefined), undefined);
  assert.equal(safePublicFile(path, "__proto__" as ErrorResource), undefined);
  assert.equal(safePublicFile(undefined, "catalogue-index"), undefined);
});

test("publication identifiers omit citation-dependent shard keys and hashes", () => {
  const normalized = "/ref/publications/[shard].json.gz";
  for (const key of ["00", "3f"])
    assert.equal(
      safePublicFile(`/ref/publications/${key}.${"a".repeat(64)}.json.gz`, "publication-labels"),
      normalized,
    );
  assert.equal(safePublicFile(normalized, "publication-labels"), normalized);
  assert.equal(
    safePublicFile(`/ref/publications/PRIVATE.json.gz`, "publication-labels"),
    undefined,
  );
});
