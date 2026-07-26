import {
  createCacheRecord,
  type CacheRecord,
} from "@lucid-softworks/cache-core";
import { MemoryCacheStore } from "@lucid-softworks/cache-store-memory";
import { describe, expect, it, vi } from "vitest";

import { CacheLoader } from "../src/index.js";

describe("CacheLoader", () => {
  it("returns fresh hits without loading", async () => {
    const store = new MemoryCacheStore<number>({ now: () => 0 });
    store.set("key", createCacheRecord(1, { now: 0, ttl: 10 }));
    const loader = vi.fn<(key: string) => number>(() => 2);
    const cache = new CacheLoader(store, { now: () => 1 });
    await expect(cache.get("key", loader, { ttl: 10 })).resolves.toBe(1);
    expect(loader).not.toHaveBeenCalled();
  });

  it("coalesces concurrent misses and stores loaded values", async () => {
    const store = new MemoryCacheStore<number>({ now: () => 0 });
    let resolve!: (value: number) => void;
    const load = vi.fn<() => Promise<number>>(
      () => new Promise<number>((done) => (resolve = done)),
    );
    const cache = new CacheLoader(store, { now: () => 1 });
    const first = cache.get("key", load, { tags: ["tag"], ttl: 10 });
    const second = cache.get("key", load, { ttl: 10 });
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    resolve(42);
    await expect(Promise.all([first, second])).resolves.toEqual([42, 42]);
    expect(load).toHaveBeenCalledOnce();
    expect(store.get("key")).toMatchObject({ tags: ["tag"], value: 42 });
  });

  it("returns stale values while refreshing in the background", async () => {
    let now = 5;
    const store = new MemoryCacheStore<number>({ now: () => now });
    store.set(
      "key",
      createCacheRecord(1, {
        now: 0,
        staleWhileRevalidate: 10,
        ttl: 2,
      }),
    );
    const cache = new CacheLoader(store, { now: () => now });
    await expect(
      cache.get("key", async () => 2, {
        staleWhileRevalidate: 10,
        ttl: 2,
      }),
    ).resolves.toBe(1);
    await vi.waitFor(() => expect(store.get("key")?.value).toBe(2));
    now = 20;
    await expect(cache.get("key", async () => 3, { ttl: 2 })).resolves.toBe(3);
  });

  it("reports background failures while preserving stale data", async () => {
    const error = new Error("failed");
    const onBackgroundError = vi.fn<(error: unknown, key: string) => void>();
    const store = new MemoryCacheStore<number>({ now: () => 2 });
    store.set(
      "key",
      createCacheRecord(1, {
        now: 0,
        staleWhileRevalidate: 10,
        ttl: 1,
      }),
    );
    const cache = new CacheLoader(store, {
      now: () => 2,
      onBackgroundError,
    });
    await expect(
      cache.get("key", () => Promise.reject(error), { ttl: 1 }),
    ).resolves.toBe(1);
    await vi.waitFor(() =>
      expect(onBackgroundError).toHaveBeenCalledWith(error, "key"),
    );
    expect(store.get("key")?.value).toBe(1);
  });

  it("uses the system clock and can ignore unobserved refresh failures", async () => {
    const current = Date.now();
    const freshStore = new MemoryCacheStore<number>();
    freshStore.set(
      "fresh",
      createCacheRecord(1, { now: current, ttl: 60_000 }),
    );
    await expect(
      new CacheLoader(freshStore).get("fresh", () => 2, { ttl: 1 }),
    ).resolves.toBe(1);

    const staleStore = new MemoryCacheStore<number>({ now: () => 2 });
    staleStore.set(
      "stale",
      createCacheRecord(1, {
        now: 0,
        staleWhileRevalidate: 10,
        ttl: 1,
      }),
    );
    const cache = new CacheLoader(staleStore, { now: () => 2 });
    await expect(
      cache.get("stale", () => Promise.reject(new Error("ignored")), {
        ttl: 1,
      }),
    ).resolves.toBe(1);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });

  it("replaces expired records returned by non-pruning stores", async () => {
    const set = vi.fn<(key: string, record: CacheRecord<number>) => void>();
    const store = {
      delete: () => false,
      get: () => createCacheRecord(1, { now: 0, ttl: 1 }),
      set,
    };
    const cache = new CacheLoader(store, { now: () => 2 });
    await expect(cache.get("key", () => 2, { ttl: 10 })).resolves.toBe(2);
    expect(set).toHaveBeenCalledWith(
      "key",
      createCacheRecord(2, { now: 2, ttl: 10 }),
    );
  });
});
