# `@lucid-softworks/cache-loader`

Read-through loading with fresh hits, stale-while-revalidate, and per-process
singleflight protection against cache stampedes.

```ts
import { CacheLoader } from "@lucid-softworks/cache-loader";
import { MemoryCacheStore } from "@lucid-softworks/cache-store-memory";

interface Profile {
  readonly id: string;
  readonly name: string;
}

const store = new MemoryCacheStore<Profile>();
const profiles = new CacheLoader(store);
const profile = await profiles.get(
  "user-42",
  async (id) => ({
    id,
    name: "Ada",
  }),
  {
    ttl: 60_000,
    staleWhileRevalidate: 300_000,
  },
);
```

Stale refresh failures preserve the old value and can be observed through
`onBackgroundError`.
