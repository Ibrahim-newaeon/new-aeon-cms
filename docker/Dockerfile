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
RUN npm run db:generate
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
RUN apk add --no-cache libc6-compat

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/lib/db/migrations ./lib/db/migrations
# Read by migrate.cjs, which resolves ./lib/db/migrations relative to WORKDIR.
COPY --from=builder /app/migrate.cjs ./migrate.cjs

RUN mkdir -p public/uploads && chown -R nextjs:nodejs public/uploads

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 127.0.0.1, NOT localhost. Busybox wget resolves `localhost` to ::1 first, and
# the server binds HOSTNAME=0.0.0.0 which is IPv4-only — so the check got
# "connection refused" forever and the container reported unhealthy while
# serving traffic perfectly well. An orchestrator would restart it on a loop.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
