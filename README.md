# `@lucid-softworks/cache-loader`

Read-through loading with fresh hits, stale-while-revalidate, and per-process
singleflight protection against cache stampedes.

```ts
const profiles = new CacheLoader(store);
const profile = await profiles.get(userId, (id) => database.loadProfile(id), {
  ttl: 60_000,
  staleWhileRevalidate: 300_000,
});
```

Stale refresh failures preserve the old value and can be observed through
`onBackgroundError`.
