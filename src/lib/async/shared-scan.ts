export interface Scan<T, U extends unknown[]> {
  listeners: Set<(...update: U) => void>;
  latest: U | null;
  promise: Promise<T> | null;
}

// Chapters may join a counting pass already started elsewhere. Replay its latest
// progress and keep every caller updated without reading the file a second time.
export async function sharedScan<S extends object, T, U extends unknown[]>(
  cache: WeakMap<S, Scan<T, U>>,
  source: S,
  read: (report: (...update: U) => void) => Promise<T>,
  onProgress: (...update: U) => void,
): Promise<T> {
  let scan = cache.get(source);
  if (!scan) {
    scan = { listeners: new Set(), latest: null, promise: null };
    cache.set(source, scan);
    scan.promise = Promise.resolve().then(() =>
      read((...update) => {
        scan!.latest = update;
        for (const listener of scan!.listeners) listener(...update);
      }),
    );
  }
  scan.listeners.add(onProgress);
  try {
    if (scan.latest) onProgress(...scan.latest);
    return await scan.promise!;
  } finally {
    scan.listeners.delete(onProgress);
    if (cache.get(source) === scan) cache.delete(source);
  }
}
