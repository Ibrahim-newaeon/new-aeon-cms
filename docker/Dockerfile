# docker/Dockerfile
#
# node 24 to match local development: node:20 ships npm 10.8, which refuses a
# lockfile written by npm 11 and fails `npm ci` on a tree that installs fine
# locally. Build and dev must resolve the same dependency graph.
FROM node:24-alpine AS deps
WORKDIR /app
# argon2 and sharp are native modules; on musl they need a build toolchain.
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next.config.ts runs at BUILD time and bakes the media host into next/image's
# remotePatterns, so this has to be present here — supplying it only to the
# running container leaves the host off the allow-list and every bucket-hosted
# image 400s. Not a secret: it is the public read URL.
ARG S3_PUBLIC_URL=""
ENV S3_PUBLIC_URL=${S3_PUBLIC_URL}
# Build-time placeholders ONLY.
#
# `next build` imports every route module to collect page data, and lib/env.ts
# validates at import time — by design, so a misconfigured deploy dies at boot
# rather than 500-ing on first login. That same strictness fails the build when
# no config exists yet.
#
# These do not reach the running container: ENV is per-stage, and the runner
# below starts from a fresh FROM with none of it. Real secrets are injected at
# `docker run`, and lib/env.ts validates them again there.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV JWT_ACCESS_SECRET="build-time-placeholder-not-a-real-secret-1"
ENV JWT_REFRESH_SECRET="build-time-placeholder-not-a-real-secret-2"
# No `db:generate` here. The image must apply exactly the migrations committed
# to git: generating at build time diffs the schema against the newest snapshot
# and writes whatever it finds into the image. Hand-written 0016/0017 shipped
# without snapshots, so every build invented a 0018 that re-created "themes"
# and the boot migration crash-looped on 42P07. CI now fails on that drift.
# Requires `output: 'standalone'` in next.config.ts, which is now set.
RUN npm run build

# A self-contained migration runner for the runtime image.
#
# The standalone output carries only what Next traced from the app, and
# drizzle-kit is a devDependency that is not in it. Bundling pg and the drizzle
# migrator into one CommonJS file gives the runner a migrate command without
# shipping node_modules or a second install. ~360kB.
RUN npx --yes esbuild scripts/migrate-runtime.ts       --bundle --platform=node --target=node24 --format=cjs       --outfile=migrate.cjs

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# wget is in alpine's busybox; curl is NOT installed by default.
# su-exec drops privileges in the entrypoint — see docker/entrypoint.sh.
RUN apk add --no-cache libc6-compat su-exec

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/lib/db/migrations ./lib/db/migrations
# Read by migrate.cjs, which resolves ./lib/db/migrations relative to WORKDIR.
COPY --from=builder /app/migrate.cjs ./migrate.cjs

COPY --from=builder /app/docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

RUN mkdir -p public/uploads && chown -R nextjs:nodejs public/uploads

# No `USER nextjs` here, deliberately.
#
# A mounted volume arrives root-owned and replaces whatever the image put
# at that path, so a container that has already dropped privileges cannot
# create THEMES_DIR inside it. The entrypoint fixes ownership and then drops
# to nextjs itself — the app process is unprivileged either way, the only
# difference is that the chown now has a chance to run.

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 127.0.0.1, NOT localhost. Busybox wget resolves `localhost` to ::1 first, and
# the server binds HOSTNAME=0.0.0.0 which is IPv4-only — so the check got
# "connection refused" forever and the container reported unhealthy while
# serving traffic perfectly well. An orchestrator would restart it on a loop.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Migrate, then serve.
#
# Railway's Postgres has no public endpoint, so migrations can only run from
# inside the private network. The intended hook is railway.json's
# preDeployCommand — but Railway did not honour that file for this service (the
# Dockerfile itself had to be selected with RAILWAY_DOCKERFILE_PATH), and a
# release silently started with no schema: every page 500'd with 42P01 while
# /api/health returned 200, because health does not touch those tables.
#
# Putting it in the image's own start command removes the dependency on any
# platform config being read. Migrations are idempotent — drizzle skips what is
# already applied — so a restart costs one no-op query, and `&&` means a failed
# migration stops the server rather than serving against a schema that does not
# match the code.
#
# Single instance today. Running several would need a lock, because concurrent
# migrators on a fresh database can race.
# Migrate, then serve. Nothing else.
#
# There is deliberately no bootstrap step creating a first administrator from
# environment variables. The setup wizard owns that, and two ways to mint an
# owner is twice the surface for the one account that can publish, export every
# customer, and change every setting. A variable left set in a dashboard is
# also a credential sitting in plain text long after it was needed.
#
# A container that boots against an empty database serves the wizard; the app
# tolerates having no settings row until someone completes it.
# Ownership of the mounts, then migrate, then serve — as nextjs.
CMD ["./entrypoint.sh"]
