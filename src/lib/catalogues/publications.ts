import { gunzipSync } from "fflate";
import type { Fetcher } from "../io/types.ts";
import {
  publicationManifest,
  publicationLabels,
  publicationShard,
  validPmid,
} from "./publication-format.ts";
import type { PublicationLabels, PublicationManifest } from "./publication-format.ts";

/** Session-only public metadata cache. Only shards for requested citations are downloaded. */
export class PublicationCatalogue {
  private manifest: Promise<PublicationManifest> | undefined;
  private shards = new Map<string, Promise<PublicationLabels>>();
  private active = 0;
  private waiting: (() => void)[] = [];
  private readonly fetcher: Fetcher;

  constructor(fetcher: Fetcher = (input, init) => fetch(input, init)) {
    this.fetcher = fetcher;
  }

  private index() {
    this.manifest ??= this.fetcher("/ref/publications/index.json", {
      cache: "no-cache",
      signal: AbortSignal.timeout(15_000),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Publication labels unavailable");
        return publicationManifest(await response.json());
      })
      .catch((error: unknown) => {
        this.manifest = undefined;
        throw error;
      });
    return this.manifest;
  }

  private async readShard(key: string, sha: string) {
    if (this.active >= 4) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    try {
      const response = await this.fetcher(`/ref/publications/${key}.${sha}.json.gz`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("Publication shard unavailable");
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      if (digest !== sha) throw new Error("Publication shard does not match its manifest");
      return publicationLabels(JSON.parse(new TextDecoder().decode(gunzipSync(bytes))), key);
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }

  async load(ids: Iterable<string>): Promise<PublicationLabels> {
    const requested = [...new Set(ids)].filter(validPmid);
    if (!requested.length) return {};
    const manifest = await this.index();
    const keys = [...new Set(requested.map(publicationShard))];
    const loaded = await Promise.allSettled(
      keys.map((key) => {
        let pending = this.shards.get(key);
        if (!pending) {
          pending = this.readShard(key, manifest.shards[key]!).catch((error: unknown) => {
            this.shards.delete(key); // A later visit may retry; never cache a failed download.
            throw error;
          });
          this.shards.set(key, pending);
        }
        return pending;
      }),
    );
    const available = new Map<string, PublicationLabels>();
    loaded.forEach((item, i) => {
      if (item.status === "fulfilled") available.set(keys[i]!, item.value);
    });
    return Object.fromEntries(
      requested.map((id) => [id, available.get(publicationShard(id))?.[id] ?? null]),
    );
  }
}
