import {
  cacheRecordStatus,
  createCacheRecord,
  type CacheRecordOptions,
  type CacheStore,
} from "@lucid-softworks/cache-core";
import { Singleflight } from "@lucid-softworks/singleflight";

export type CacheLoadOptions = Omit<CacheRecordOptions, "now">;

export type CacheLoaderOptions = Readonly<{
  now?: () => number;
  onBackgroundError?: (error: unknown, key: string) => void;
}>;

/** Read-through loading with per-process request coalescing. */
export class CacheLoader<T> {
  readonly #flights = new Singleflight<string>();
  readonly #now: () => number;

  constructor(
    readonly store: CacheStore<T>,
    readonly options: CacheLoaderOptions = {},
  ) {
    this.#now = options.now ?? Date.now;
  }

  async get(
    key: string,
    loader: (key: string) => T | PromiseLike<T>,
    options: CacheLoadOptions,
  ): Promise<T> {
    const record = await this.store.get(key);
    if (record !== undefined) {
      const status = cacheRecordStatus(record, this.#now());
      if (status === "fresh") return record.value;
      if (status === "stale") {
        void this.#load(key, loader, options).catch((error: unknown) =>
          this.options.onBackgroundError?.(error, key),
        );
        return record.value;
      }
    }
    return this.#load(key, loader, options);
  }

  #load(
    key: string,
    loader: (key: string) => T | PromiseLike<T>,
    options: CacheLoadOptions,
  ): Promise<T> {
    return this.#flights.do(key, async () => {
      const value = await loader(key);
      await this.store.set(
        key,
        createCacheRecord(value, { ...options, now: this.#now() }),
      );
      return value;
    });
  }
}
