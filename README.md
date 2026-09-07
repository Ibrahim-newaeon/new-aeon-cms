# New Aeon CMS

Bilingual (Arabic/English) CMS and COD e-commerce platform. Next.js 15, PostgreSQL/Drizzle, Redis rate limits, S3-compatible media.

## Baseline

Tag **`v1.0.0-baseline`** marks the stable product before the theme-engine investment. We are **not** forking into a second repo — new work lands in this codebase behind a storefront **theme driver**.

| Driver | Status |
|--------|--------|
| `builtin` | Live — React storefront (default) |
| `html-pack` | Reserved — HTML theme zip runtime (next) |

## Paste HTML v2 (shipped)

Settings → Appearance:

- **HTML paste mode:** `safe` (default) · `designer` · `trusted`
- **Storefront driver:** Builtin React (HTML packs coming next)

HTML blocks in the page editor:

- **Isolate CSS** — scopes pasted `<style>` / rules so they cannot restyle nav/footer
- **Full page** — hides site chrome (nav, footer, announcement, WhatsApp) for legacy full-page pastes

Scripts, event handlers, and dangerous URLs are always stripped.

## Run locally

```bash
cp .env.example .env
npm install
docker compose up -d   # Postgres + Redis
npm run db:migrate
npm run db:seed        # optional; default seed password is for local only
npm run dev
```

Useful scripts: `npm run typecheck`, `npm test`, `npm run lint`, `npm run test:e2e`.

See `CLAUDE.md` for engineering rules and `.env.example` for production requirements (Redis, SMS, mail, JWT secrets).

## Roadmap (theme investment)

1. **Paste HTML v2** — done (this release)
2. **HTML theme zip v1** — marketing templates; cart/checkout stay builtin
3. **PHP theme convert** — import zip → HTML pack (no PHP runtime in production)

## Licence

Commercial — see `LICENSE` and `LICENSING.md`.
