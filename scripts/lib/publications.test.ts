import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { paths } from "./config.ts";
import { bgzfWrite } from "./io/bgzf.ts";
import { CATALOG_HEADER } from "./clinvar.ts";
import { buildPublications, checkPublications, requireCachedPublications } from "./publications.ts";
import { publicationLabel, parsePublicationResponse } from "./reference/publication-metadata.ts";

const summary = (id: string) => ({
  uid: id,
  authors: [
    { name: "Brooks PJ", authtype: "Author" },
    { name: "Enoch MA", authtype: "Author" },
  ],
  pubdate: "2009 Mar 24",
  fulljournalname: "PLoS medicine",
  source: "PLoS Med",
});
function fixture(t: test.TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genomewalk-publications-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = paths({ "data-dir": path.join(dir, "data"), "out-dir": path.join(dir, "ref") });
  const write = (build: string, pmids: string) => {
    const row = Array<string>(24).fill("");
    row.splice(0, 7, "1", "100", "G", "A", "P", "1", "TEST");
    row[18] = pmids;
    bgzfWrite(`${CATALOG_HEADER}\n${row.join("\t")}\n`, files.catalog(build));
  };
  write("GRCh38", "19320537,28492532");
  write("GRCh37", "19320537,65");
  return { paths: files, write };
}

test("citation labels retain authors, journal and year without assuming missing metadata", () => {
  assert.equal(publicationLabel(summary("1")), "Brooks et al., PLoS Medicine 2009");
  assert.equal(
    publicationLabel({ ...summary("1"), authors: [{ name: "de Vries AB", authtype: "Author" }] }),
    "de Vries, PLoS Medicine 2009",
  );
  assert.equal(
    publicationLabel({
      ...summary("1"),
      authors: [{ name: "ABC Study Group", authtype: "CollectiveName" }],
    }),
    "ABC Study Group, PLoS Medicine 2009",
  );
  assert.equal(
    publicationLabel({
      ...summary("1"),
      fulljournalname:
        "Genetics in medicine : official journal of the American College of Medical Genetics",
    }),
    "Brooks et al., Genetics in medicine 2009",
  );
  assert.equal(publicationLabel({ ...summary("1"), authors: [] }), null);
  assert.equal(publicationLabel({ ...summary("1"), pubdate: "" }), null);
  assert.throws(() => parsePublicationResponse({ result: {} }, ["1"]), /did not return/);
  assert.throws(
    () => parsePublicationResponse({ result: { "1": summary("2") } }, ["1"]),
    /did not return/,
  );
  assert.throws(
    () => parsePublicationResponse({ error: "API rate limit exceeded" }, ["1"]),
    /Invalid/,
  );
  assert.deepEqual(
    parsePublicationResponse({ result: { "1": { error: "cannot get document summary" } } }, ["1"]),
    { "1": null },
  );
});

test("publication builds deduplicate across builds, resume from cache and publish verified static labels", async (t) => {
  const options = fixture(t),
    requested: string[][] = [];
  const fetcher: typeof fetch = async (input, init) => {
    assert.match(String(input), /eutils\.ncbi\.nlm\.nih\.gov/);
    assert.equal(init?.method, "POST");
    const params = init!.body as URLSearchParams;
    const ids = params.get("id")!.split(",");
    requested.push(ids);
    return Response.json({
      result: Object.fromEntries(
        ids.map((id) => [
          id,
          id === "65" ? { uid: id, error: "cannot get document summary" } : summary(id),
        ]),
      ),
    });
  };
  const manifest = await buildPublications(options, { fetcher });
  assert.equal(manifest.count, 3);
  assert.equal(manifest.labeled, 2);
  assert.equal(Object.keys(manifest.shards).length, 64);
  assert.deepEqual(requested, [["65", "19320537", "28492532"]]);
  await checkPublications(options);
  const noNetwork: typeof fetch = async () => {
    throw new Error("unexpected network");
  };
  assert.deepEqual(
    await buildPublications({ ...options, offline: true }, { fetcher: noNetwork }),
    manifest,
  );
  options.write("GRCh38", "19320537,28492532,999");
  const before = fs.readFileSync(path.join(options.paths.output, "publications/index.json"));
  await assert.rejects(
    buildPublications({ ...options, offline: true }, { fetcher: noNetwork }),
    /lacks 1 PMIDs/,
  );
  assert.deepEqual(
    fs.readFileSync(path.join(options.paths.output, "publications/index.json")),
    before,
  );
  await buildPublications({ ...options, only: "GRCh38" }, { fetcher });
  assert.deepEqual(requested[1], ["999"]);
  await checkPublications(options);
  const sha = manifest.shards["01"]!;
  const shard = path.join(options.paths.output, `publications/01.${sha}.json.gz`);
  fs.writeFileSync(shard, gzipSync(JSON.stringify({ "65": "Wrong label" })));
  await assert.rejects(checkPublications(options), /checksum/);
});

test("offline preflight checks the incoming release without writes or network", async (t) => {
  const options = fixture(t);
  for (const build of ["GRCh38", "GRCh37"])
    bgzfWrite(
      "##fileformat=VCFv4.2\n1\t100\t123\tG\tA\t.\t.\tCLNSIG=Pathogenic\n",
      options.paths.clinvar(build),
    );
  fs.writeFileSync(
    options.paths.citations,
    "#ClinVar germline citations v1\t2026-09-18\n#VariationID\tPMIDs\n123\t19320537\n#Complete\t1\n",
  );
  await assert.rejects(requireCachedPublications(options), /No build stages ran/);
  assert.ok(!fs.existsSync(path.join(options.paths.data, "publications.json.gz")));
  await buildPublications(options, {
    fetcher: async (_url, init) => {
      const ids = (init!.body as URLSearchParams).get("id")!.split(",");
      return Response.json({ result: Object.fromEntries(ids.map((id) => [id, summary(id)])) });
    },
  });
  await requireCachedPublications(options);
  const cache = JSON.parse(
    gunzipSync(fs.readFileSync(path.join(options.paths.data, "publications.json.gz"))).toString(),
  );
  assert.equal(cache.entries["19320537"].label, "Brooks et al., PLoS Medicine 2009");
  assert.ok(cache.entries["19320537"].fetchedAt);
});
