# Production checklist

Before pointing a client domain at this app:

## Required

- [ ] Unique `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (≥32 chars, different)
- [ ] `NEXT_PUBLIC_APP_URL` = the public HTTPS origin
- [ ] `DATABASE_URL` points at managed Postgres (backups on)
- [ ] `REDIS_URL` set (or `ALLOW_IN_MEMORY_RATE_LIMIT=true` for a **single** instance only)
- [ ] `STORAGE_DRIVER=s3` with bucket credentials + `S3_PUBLIC_URL` (at **build** and runtime)
- [ ] `MAIL_DRIVER=smtp` or `resend` (not `log`) + `MAIL_FROM` / `MAIL_ADMIN_TO`
- [ ] `SMS_DRIVER=twilio` if customer phone OTP is used (or `ALLOW_CONSOLE_SMS=true` only as emergency)
- [ ] Run migrations on boot / deploy (`db:migrate`) — never `db:push --force` on prod
- [ ] Change any seed passwords; do not run `db:seed` on a live URL
- [ ] Licence contact in `LICENSE` is filled; invoice records the licence tier

## Strongly recommended

- [ ] `WHITE_LABEL=true` only if the client bought that tier
- [ ] Health check `/api/health` returns `200` with `"rateLimit":"redis"` in production
- [ ] Coming-soon mode off after launch
- [ ] SPF/DKIM for `MAIL_FROM` domain

## Explicitly not included (sell honestly)

- Card / wallet payments — COD only today
- Running PHP themes live — convert to HTML packs only
- Multi-tenant SaaS — one licence, one production instance

See also `.env.example` and `docs/sales.md`.
