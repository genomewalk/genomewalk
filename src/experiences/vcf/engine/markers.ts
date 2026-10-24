import { ctx } from "./context.ts";
import { refUrl } from "./view/file.ts";
import { fetchPublic, readPublicBytes, decodePublicJson } from "../../../lib/io/fetch-public.ts";
import type { MarkerData } from "../../../lib/catalogues/types.ts";
import { AppError } from "../../../lib/app-error.ts";

export async function loadMarkers() {
  if (ctx.markers && ctx.markers.build === ctx.build) return ctx.markers;
  const res = await fetchPublic(refUrl("markers.json"), "markers");
  const data = decodePublicJson<MarkerData>(await readPublicBytes(res, "markers"), "markers");
  if (data.build !== ctx.build)
    throw new AppError("REFERENCE_BUILD_MISMATCH", "Marker reference build mismatch", {
      resource: "markers",
    });
  ctx.markers = data;
  return ctx.markers;
}
