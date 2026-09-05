---
paths:
  - "lib/db/**"
  - "scripts/**"
  - "lib/**/*storage*"
  - "lib/**/*database*"
  - "lib/**/*schema*"
---

# Migration and storage rules

- Keep Drizzle migrations forward-only and verify both existing and fresh installation paths.
- Review destructive operations, locks, defaults, indexes, constraints, backfills, and recovery.
- The setup:check integration test terminates sessions and drops/recreates a test database on the configured host; it needs an approved disposable local host.
- Setup reset, forced db push, storage migration, seeding shared data, and deployment require explicit approval and a recovery plan.
