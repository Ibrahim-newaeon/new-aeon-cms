# docker/Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
# argon2 and sharp are native modules; on musl they need a build toolchain.
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# drizzle-kit reads DATABASE_URL at config load. A syntactically valid
# placeholder is enough for `generate`, which never connects.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run db:generate
# Requires `output: 'standalone'` in next.config.ts, which is now set.
RUN npm run build

FROM node:20-alpine AS runner
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

RUN mkdir -p public/uploads && chown -R nextjs:nodejs public/uploads

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
