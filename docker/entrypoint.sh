#!/bin/sh
# docker/entrypoint.sh
#
# Runs as root, hands the app to an unprivileged user, and exists for one
# reason: a mounted volume arrives owned by root.
#
# The image chowns the directories it creates, but a volume mount REPLACES the
# directory it covers at container start — the build-time ownership goes with
# it. So a container that drops to uid 1001 in the Dockerfile cannot create
# THEMES_DIR inside a fresh mount, and the first theme-pack upload fails with
# EACCES surfacing as a generic "Upload failed" (the route's catch-all, since
# every validation failure has its own message).
#
# Fixing it has to happen after the mount and before the app starts, which is
# what an entrypoint is. The server itself never runs as root: su-exec drops
# to nextjs for the migrate-and-serve step, and `exec` keeps that process as
# PID 1 so signals and exit codes still reach the orchestrator.
set -e

# Defaults mirror lib/env.ts, so an install that sets neither still gets the
# directories it will use. WORKDIR is /app, so these resolve under it.
THEMES_DIR="${THEMES_DIR:-./data/themes}"
UPLOAD_DIR="${UPLOAD_DIR:-./public/uploads}"

for dir in "$THEMES_DIR" "$UPLOAD_DIR"; do
  mkdir -p "$dir"

  # Recurse only when the directory is not already ours. A media library can
  # hold thousands of files, and paying a full tree walk on every restart to
  # re-apply ownership nothing changed is a slow boot for no benefit. The
  # first boot after a mount does the work; later ones cost a single stat.
  if [ "$(stat -c %u "$dir")" != "1001" ]; then
    chown -R nextjs:nodejs "$dir"
  fi
done

# Migrations first, and `&&` so a failed migration stops the server rather
# than serving against a schema that does not match the code.
exec su-exec nextjs sh -c 'node migrate.cjs && node server.js'
