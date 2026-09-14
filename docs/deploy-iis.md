# Deploying to a Windows / IIS host

For hosts such as SmarterASP.NET, which run Node behind IIS via
**httpPlatformHandler** and now offer PostgreSQL.

> **Untested.** Written from the host's published documentation, not from a
> deployment that has run. Every step below is a starting point to verify. The
> Docker path (`docker/Dockerfile`) is the one this project actually ships on.

---

## Whether to do this at all

This is viable, and it is a downgrade in operations. Weigh it honestly.

**What you lose:** Docker, the CI matrix in `.github/workflows/deploy.yml`, and
the guarantee that migrations run before the server starts. Deploys become a
manual file upload per site.

**What you gain:** a real filesystem, so uploads and theme packs persist without
configuring a volume.

For one small, rarely-changing site on a Windows plan you already pay for, it is
reasonable. For several client sites from one codebase, it is not.

---

## Prerequisites to confirm first

Confirm all four **before** uploading anything. Any one of them can sink the
deployment after the work is done.

| # | Check | Why |
|---|---|---|
| 1 | **Node 20 or newer** | Next 15 requires ≥ 18.18. The host has a version selector; find it |
| 2 | **PostgreSQL, with remote connections** | Migrations are run from your machine, so the database must be reachable |
| 3 | **A writable path** for uploads and theme packs | Both are written at runtime |
| 4 | **Windows-built `sharp`** | See below — this is the one that bites |

### The `sharp` problem

The host's documentation says `node_modules` must be **uploaded**, not installed
on the server. `sharp` ships platform-specific native binaries, so a
`node_modules` built on macOS contains Darwin binaries and **fails at runtime on
Windows** — after a build that looked fine.

Install the Windows binaries explicitly before uploading:

```bash
npm ci --omit=dev
npm install --cpu=x64 --os=win32 sharp
```

Verify the platform directory exists:

```bash
ls node_modules/@img | grep win32
```

If it is absent, the deployment will fail on the first image upload, not at
boot — so check before you ship, not after.

---

## Build

`next.config.ts` emits `output: 'standalone'`, which produces a self-contained
server plus the minimal dependency tree.

```bash
DATABASE_URL='postgres://…' \
JWT_ACCESS_SECRET='…' JWT_REFRESH_SECRET='…' \
NEXT_PUBLIC_APP_URL='https://your-domain' \
npm run build
```

The build needs those four set, and prints database connection errors from
prerender probes that are **not** failures — check the exit code, not the log.

---

## What to upload

```
site root/
  server.js              from .next/standalone/
  .next/                 standalone's copy, plus .next/static/
  public/
  node_modules/          with the win32 sharp binaries
  web.config             from deploy/iis/web.config.example
  data/uploads/          created, writable
  data/themes/           created, writable
  logs/                  created, writable — httpPlatform writes stdout here
```

Copy `.next/static` into the standalone tree; the standalone build does not
include it and every stylesheet and script 404s without it.

---

## Configure

Copy `deploy/iis/web.config.example` to the site root as `web.config` and fill
in the placeholders.

**Secrets:** if the control panel offers environment variables, set them there
and delete the matching `environmentVariable` lines. `web.config` sits in the
web root as plain text, is included in every backup, and is readable by anyone
with file access to the account. Never commit a filled-in copy.

**`PORT` must stay `%HTTP_PLATFORM_PORT%`.** IIS assigns a free port per process
and passes it through that token. A hardcoded number makes IIS proxy to a port
nothing is listening on, and the symptom is a 502 with a healthy-looking Node
process.

---

## Migrations

No Docker means no entrypoint, so the "migrate, then start" guarantee is gone.
Run them from your machine against the remote database, **before** each deploy
that includes a schema change:

```bash
DATABASE_URL='postgres://…remote…' npm run db:migrate
```

Forgetting this starts a server whose code expects columns the database does not
have. Put it in the deploy checklist; nothing enforces it here.

---

## First-boot checks

1. `https://your-domain/api/health` — a JSON body, not a 502.
2. `.\logs\node` — `lib/env.ts` names any missing or malformed variable on exit.
3. `/setup` — completes, and creates an admin.
4. Upload an image in **Media**. This is the `sharp` test; nothing earlier
   exercises it.
5. Upload and activate a theme pack. This is the `THEMES_DIR` write test.

---

## When it fails

| Symptom | Likely cause |
|---|---|
| 502, no log written | `processPath` wrong, or Node not on PATH for the pool |
| 502, log shows a validation error | A missing env var. `lib/env.ts` names the field |
| Boots, then dies on image upload | `sharp` built for the wrong platform |
| Every asset 404s | `.next/static` not copied into the standalone tree |
| `Upload failed` in Media | `UPLOAD_DIR` missing or not writable by the pool identity |
| Theme pack upload fails | Same, for `THEMES_DIR` |
| Slow first request after idle | The pool recycled; `startupTimeLimit` covers the restart |
