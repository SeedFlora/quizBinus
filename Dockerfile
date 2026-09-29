# syntax=docker/dockerfile:1
#
# NUSAQUEST production image: Next.js 16 standalone server + game server + migrations.
# Self-hosted by design (Docker on Proxmox or any Linux host); no managed cloud services.
#
#   docker compose up -d --build                     # recommended: app + PostgreSQL (see docker-compose.yml)
#
#   docker build -t nusaquest .                      # or build the image on its own
#   docker run --init -p 3000:3000 nusaquest          # memory mode: no database, nothing persisted
#   docker run --init -p 3000:3000 --env-file .env \
#     -v nusaquest-uploads:/app/data/uploads nusaquest   # database mode (DATABASE_URL in .env)
#
# Build args vs runtime env:
#   NEXT_PUBLIC_* values are inlined into the browser JavaScript by `next build`, so they
#   are BUILD ARGS; setting them at `docker run` time changes nothing in the client.
#   Everything else (DATABASE_URL, ADMIN_*, APP_URL, SESSION_COOKIE_SECURE, TRUST_PROXY,
#   UPLOAD_DIR) is read by the server at RUNTIME, so one image serves any environment
#   and secrets never land in an image layer. Never pass a secret as a build arg: build
#   args are visible in `docker history`.
#
# At start-up, instrumentation.ts runs ensureServerReady(): it applies the SQL migrations
# copied from drizzle/ (database mode), bootstraps the first admin from ADMIN_EMAIL /
# ADMIN_PASSWORD, then restores unfinished game sessions.

ARG NODE_IMAGE=node:24-alpine

# ---------------------------------------------------------------------------------------
# base: shared settings for every stage
# ---------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------------------------------
# deps: install exactly what package-lock.json says (dev deps included: the build needs
# TypeScript, Tailwind and PostCSS). The npm cache mount keeps rebuilds fast without
# bloating layers. The lockfile already lists the linux-musl native binaries
# (@next/swc, lightningcss, @tailwindcss/oxide) needed on Alpine.
# ---------------------------------------------------------------------------------------
FROM base AS deps
# libc6-compat: glibc shims some prebuilt native modules still expect on musl.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------------------
# builder: compile the app with the public configuration baked in
# ---------------------------------------------------------------------------------------
FROM base AS builder

# Browser-visible configuration (inlined at build time, see header).
#   NEXT_PUBLIC_APP_URL         public origin for QR codes / join links; empty = the origin
#                               the host screen is opened on (fine for LAN classrooms)
#   NEXT_PUBLIC_REALTIME_MODE   server (default: multi-device via this server) | local
#                               (in-browser solo demo only)
#   NEXT_PUBLIC_BINUS_LOGO_SRC  path/URL of the official logo, e.g. /brand/binus.svg
ARG NEXT_PUBLIC_APP_URL=""
ARG NEXT_PUBLIC_REALTIME_MODE="server"
ARG NEXT_PUBLIC_BINUS_LOGO_SRC=""
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_REALTIME_MODE=${NEXT_PUBLIC_REALTIME_MODE} \
    NEXT_PUBLIC_BINUS_LOGO_SRC=${NEXT_PUBLIC_BINUS_LOGO_SRC} \
    NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next/font downloads Google Fonts here, so the build needs outbound network access.
# The .next/cache mount reuses the compiler cache between local rebuilds.
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ---------------------------------------------------------------------------------------
# runner: minimal runtime (standalone server + static assets + migrations), non-root
# ---------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

# HOSTNAME=0.0.0.0 makes the standalone server listen on every interface; without it the
# server binds to the container hostname and the port mapping can't reach it.
# UPLOAD_DIR is where lecturers' question images are stored: mount a volume there.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/app/data/uploads

# Optional build metadata surfaced by GET /api/health (e.g. --build-arg APP_VERSION=$GIT_SHA).
ARG APP_VERSION=""
ENV APP_VERSION=${APP_VERSION}

# `standalone` holds server.js plus only the node_modules files the server traces to
# (including pg and the drizzle-orm migrator, imported via instrumentation.ts).
# public/ and .next/static are not part of it by design, so they are copied next to
# server.js, which then serves them itself. drizzle/ holds the generated SQL migrations:
# the migrator reads them from disk at start-up (path.join(process.cwd(), "drizzle");
# server.js runs with /app as its working directory), which file tracing can't see.
# Everything is owned by the unprivileged `node` user (uid 1000, built into the official
# image) so the server can write its runtime cache under .next/cache.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/drizzle ./drizzle

# Upload directory owned by the app user. A new named volume mounted here inherits this
# ownership; a bind mount must be chowned to 1000:1000 on the host (docs/DEPLOYMENT.md).
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data

USER node

EXPOSE 3000

# No curl/wget dependency: Node's built-in fetch probes the app from inside the container.
# start-period covers migrations + session restore on a cold start.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "server.js"]
