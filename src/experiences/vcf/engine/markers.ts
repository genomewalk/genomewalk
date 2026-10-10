import { ctx } from "./context.ts";
import { refUrl } from "./view/file.ts";

export async function loadMarkers() {
  if (ctx.markers && ctx.markers.build === ctx.build) return ctx.markers;
  const res = await fetch(refUrl("markers.json"));
  if (!res.ok) throw new Error(`markers download failed (${res.status})`);
  ctx.markers = await res.json();
  return ctx.markers;
}
