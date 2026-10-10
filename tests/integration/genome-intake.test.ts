import test from "node:test";
import assert from "node:assert/strict";
import { chooseGenomeFile, createIntakeRequests } from "../../src/lib/intake/genome-intake.ts";

const file = (name: string) => new File(["synthetic"], name);

test("intake chooses one genome and permits only its accompanying VCF indexes", () => {
  const vcf = file("sample.vcf.gz");
  const index = file("sample.vcf.gz.tbi");
  assert.equal(chooseGenomeFile([vcf]), vcf);
  assert.equal(chooseGenomeFile([index, vcf]), vcf);
  assert.equal(chooseGenomeFile([file("sample.vcf.gz.csi"), vcf]), vcf);
  const consumer = file("23andme.txt");
  assert.equal(chooseGenomeFile([consumer]), consumer);
  for (const files of [
    [],
    [vcf, file("other.vcf.gz")],
    [vcf, consumer],
    [vcf, file("other.tbi")],
    [consumer, index],
  ]) {
    assert.throws(() => chooseGenomeFile(files), /one DNA file/);
  }
});

test("a later file choice supersedes a slow import or sample download", async () => {
  const requests = createIntakeRequests();
  const first = requests.begin();
  const { promise: pending, resolve: finish } = Promise.withResolvers<void>();
  const committed = [];
  const read = (async () => {
    await pending;
    if (requests.isCurrent(first)) committed.push("older file");
  })();
  const second = requests.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(requests.isCurrent(first), false);
  assert.equal(requests.isCurrent(second), true);
  committed.push("newer file");
  finish();
  await read;
  assert.deepEqual(committed, ["newer file"]);
});

test("leaving the picker cancels outstanding work and a fresh visit can start again", () => {
  const requests = createIntakeRequests();
  const first = requests.begin();
  requests.cancel();
  assert.equal(first.signal.aborted, true);
  assert.equal(requests.isCurrent(first), false);
  const next = requests.begin();
  assert.equal(requests.isCurrent(next), true);
});
