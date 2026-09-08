# Railway migrate-on-boot runbook

How schema migrations run in production, and what to do when they fail.

## How it works

The Docker image starts with:

```sh
node migrate.cjs && node server.js
```

(`docker/Dockerfile` `CMD`)

1. `migrate.cjs` is an esbuild bundle of `scripts/migrate-runtime.ts`.
2. It applies pending files under `lib/db/migrations/` via Drizzle.
3. Only if that exits `0` does Next start.

Migrations were moved into the image start command because Railway did **not** honour `railway.json` `preDeployCommand` for this service. A release that skipped migrate left an empty schema: pages returned `42P01` (undefined table) while `/api/health` still returned **200** (health only checks `SELECT 1`, Redis/rate-limit, and env — not table presence).

## Symptoms

| What you see | Likely cause |
|--------------|--------------|
| Deploy crash-loops; logs show migrate error | Migration failed (see below) |
| App “up”, every page 500 with `relation "…" does not exist` (`42P01`) | Migrate never ran (old image / wrong CMD) or DB is empty |
| `/api/health` 200 but storefront/admin broken | Same — health ≠ schema |
| Checkout 500 on `nextval('order_number_seq')` | Sequence missing (often after `db:push` on a DB that drifted) |
| Two instances racing on first boot | Concurrent migrators without a lock |

## Immediate checks

1. Open Railway → service → **Deployments** → latest → logs.
2. Search for `migrate` / `Drizzle` / `error`. A failed migrate exits non-zero and must not reach `server.js`.
3. Confirm `DATABASE_URL` on the **same** service (private network URL, not a public proxy you cannot reach from the container).
4. Hit `/api/health` — useful for Redis/env, **not** proof that migrations applied.

## Fix paths

### A. Migrate failed (syntax / conflict / permissions)

1. Copy the full migrate stack trace from the deploy log.
2. Reproduce locally against a copy of the DB (or a fresh DB + `npm run db:migrate:check`).
3. Do **not** run `npm run db:push --force` on production — it can drop objects the app still needs (e.g. `order_number_seq`).
4. Add a forward-only SQL migration under `lib/db/migrations/` (`npm run db:generate` after schema edits), commit, redeploy.
5. If a bad migration was already recorded in `drizzle.__drizzle_migrations` but not fully applied, repair carefully (manual SQL + sync the migrations table). Prefer support/engineering help over improvising on live data.

### B. Schema missing but process is healthy

1. Confirm the running image still uses `node migrate.cjs && node server.js`.
2. Redeploy the latest image so migrate runs again (idempotent — already-applied files are skipped).
3. If migrate succeeds and pages still 500, verify `DATABASE_URL` points at the database you expect (staging vs prod mix-up).

### C. Sequence / checkout nextval errors

1. Ensure `order_number_seq` exists (declared in `lib/db/schema` and created by migration `0006` / push-safe declaration).
2. Create it only if missing:

```sql
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1000;
```

### D. Multi-instance race

Today the app assumes a **single** web instance at migrate time. If you scale to N replicas:

- Run migrate once in a release phase / one-off job, **or**
- Add an advisory lock around migrate before scaling out.

## Local / CI proofs

| Command | Purpose |
|---------|---------|
| `npm run db:migrate` | Apply migrations using `.env` `DATABASE_URL` |
| `npm run db:migrate:check` | Fresh DB: migrate must succeed end-to-end |
| `npm run db:generate` | Emit SQL from schema changes (commit the files) |

## Prevention checklist

- [ ] Never `db:push --force` on a shared or production database
- [ ] Always commit generated files in `lib/db/migrations/`
- [ ] Keep Dockerfile `CMD` as migrate-then-serve
- [ ] Treat `/api/health` 200 as “process up”, not “schema ready”
- [ ] After a failed migrate, fix forward — do not delete migration history lightly

See also `docs/production.md` and comments in `docker/Dockerfile`.
