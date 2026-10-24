import { gunzipSync } from "fflate";
import { AppError, type ErrorResource } from "../app-error.ts";
import type { Fetcher } from "./types.ts";

function downloadFailure(error: unknown, resource: ErrorResource, httpStatus?: number): never {
  // Cancellation is control flow, not a failed download. Timeouts remain actionable.
  if (error instanceof Error && error.name === "AbortError") throw error;
  throw new AppError(
    error instanceof Error && error.name === "TimeoutError" ? "NETWORK_TIMEOUT" : "NETWORK_FAILED",
    undefined,
    { resource, ...(httpStatus == null ? {} : { httpStatus }) },
  );
}

/** Callers supply a fixed resource category; request URLs, bodies and headers are never retained. */
export async function fetchPublic(
  input: string | URL | Request,
  resource: ErrorResource,
  init?: RequestInit,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  let response: Response;
  try {
    init?.signal?.throwIfAborted();
    response = await fetcher(input, init);
  } catch (error) {
    // Some fetch implementations replace the abort reason with a generic network error.
    if (init?.signal?.aborted) {
      const reason = init.signal.reason;
      if (!(reason instanceof Error && reason.name === "TimeoutError")) throw reason;
      downloadFailure(reason, resource);
    }
    downloadFailure(error, resource);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new AppError("HTTP_ERROR", undefined, { resource, httpStatus: response.status });
  }
  return response;
}

export async function readPublicBytes(response: Response, resource: ErrorResource) {
  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    downloadFailure(error, resource, response.status);
  }
}

/** Only public reference files use this decoder; private file parsers retain their own errors. */
export function decodePublicJson<T>(bytes: Uint8Array, resource: ErrorResource): T {
  try {
    const json = bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes;
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json));
  } catch {
    throw new AppError("REFERENCE_DECODE_FAILED", undefined, { resource });
  }
}
