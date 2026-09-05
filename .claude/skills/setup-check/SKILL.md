---
name: setup-check
description: Review CMS setup and choose safe checks; run the destructive setup integration check only on an approved disposable local host.
disable-model-invocation: true
---

1. Read package.json, scripts/setup-check.ts, and the affected setup or migration code.
2. Run relevant lint, type, unit, and build checks. Report missing prerequisites.
3. The setup:check script connects to the configured PostgreSQL host, terminates sessions, and drops/recreates aeon_setup_check. Its name does not make it a read-only check.
4. Before running npm run setup:check, obtain approval for that operation and confirm the database host is a disposable local fixture, separate from shared or production databases. Do not print the connection string.
5. Run browser and migration integration checks only against approved disposable fixtures.
6. Report pass/fail/skipped accurately. Do not run setup:reset, db:push, media:migrate, or deploy as part of setup verification.
