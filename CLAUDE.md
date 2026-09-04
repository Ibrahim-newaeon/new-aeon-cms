# New Aeon CMS Project Guide

New Aeon CMS is a Next.js/TypeScript content and commerce platform with Drizzle/PostgreSQL, Redis, object storage, rich-text editing, localization, email, setup flows, and an administrative application. The default branch is **master**.

## Sources of truth

Prefer registered code and tests, then **package.json**, Drizzle schema/migrations, CI, environment examples, and focused documents under **docs/**. Setup, migration, licensing, storage, themes, commerce, and localization behavior all have tests; do not infer status from filenames alone.

## Repository map

- **app/** — route groups for setup, authentication, administration, site, and APIs
- **components/** — shared editor and UI components
- **lib/** — domain logic, persistence, authentication, storage, and integrations
- **scripts/** — setup, migrations, seed, storage migration, and verification tools
- **tests/** — Vitest coverage for permissions, money, storage, imports, themes, licensing, SEO, and more
- **e2e/** — Playwright flows
- **messages/** and **i18n/** — localized content and routing

## Commands

~~~bash
cp .env.example .env
npm ci
npm run setup:check
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
~~~

Database changes use **db:generate** and **db:migrate**. **db:push --force**, setup reset, storage migration, and deployment are destructive or environment-changing operations and require explicit authorization and a recovery plan.

## Engineering rules

- Preserve setup-state gates, authentication, content permissions, licensing checks, and administrator authorization on the server.
- Sanitize rich text and imported content; validate uploads, archive extraction, CSV/XLSX data, and API payloads.
- Keep storage credentials, mail credentials, JWT/encryption secrets, and database URLs out of source and client bundles.
- Maintain forward-only Drizzle migrations and verify them against both existing and fresh installations.
- Preserve locale routing, translated messages, RTL behavior, accessibility, SEO metadata, sitemap/robots, and structured data.
- Use the existing content-type registry, block editors, theme tokens, and storage abstractions rather than parallel implementations.
- Treat money as domain data and keep the tested representation and price-direction rules intact.
- Keep rate limiting effective in the deployment topology and run its verification when changing auth or APIs.

A feature is complete only when unit coverage, migration/setup checks, build, and relevant E2E tests pass.
