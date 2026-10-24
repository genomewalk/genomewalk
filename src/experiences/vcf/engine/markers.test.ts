import assert from "node:assert/strict";
import test from "node:test";
import { ctx } from "./context.ts";
import { loadMarkers } from "./markers.ts";
import { AppError } from "../../../lib/app-error.ts";

test("VCF marker downloads reject a mismatched public build without caching it", async (t) => {
  const previous = { ...ctx };
  t.after(() => {
    Object.assign(ctx, previous);
    if (!previous.markers) delete ctx.markers;
    if (!("build" in previous)) delete ctx.build;
  });
  ctx.build = "GRCh38";
  delete ctx.markers;
  let build = "GRCh37";
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return Response.json({ build, markers: [], pops: {} });
  });
  await assert.rejects(loadMarkers(), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, "REFERENCE_BUILD_MISMATCH");
    assert.deepEqual(error.details, { resource: "markers" });
    return true;
  });
  assert.equal(ctx.markers, undefined);
  build = "GRCh38";
  assert.equal((await loadMarkers())?.build, "GRCh38");
  await loadMarkers();
  assert.equal(requests, 2, "only a validated marker response is cached");
});
