#!/usr/bin/env bash
# NUSAQUEST restore: database dump (+ optional uploads archive) into the compose stack.
#
#   deploy/backup/restore.sh backups/nusaquest-20260928T190000Z.dump
#   deploy/backup/restore.sh backups/nusaquest-20260928T190000Z.dump backups/uploads-20260928T190000Z.tar.gz
#   deploy/backup/restore.sh --yes <dump> [<uploads>]       # no confirmation prompt
#
# What it does: stops the app (so no game writes during the restore), replaces every
# table in the database with the dump's contents in ONE transaction (pg_restore --clean
# --single-transaction: it either fully succeeds or changes nothing), optionally replaces
# the uploads volume, then starts the app again. The app re-applies any newer migrations
# on start, so restoring an older dump into a newer release is fine.
# Live games at the moment of the dump come back as restored sessions.

set -euo pipefail
# Git Bash on Windows would rewrite container paths such as /app/data/uploads; no-op on Linux.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"

YES=0
if [ "${1:-}" = "--yes" ]; then
  YES=1
  shift
fi

DUMP="${1:-}"
UPLOADS="${2:-}"

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "usage: $0 [--yes] <nusaquest-*.dump> [<uploads-*.tar.gz>]" >&2
  exit 64
fi
if [ -n "$UPLOADS" ] && [ ! -f "$UPLOADS" ]; then
  echo "uploads archive not found: $UPLOADS" >&2
  exit 66
fi

# Resolve paths before changing directory.
DUMP="$(cd "$(dirname "$DUMP")" && pwd)/$(basename "$DUMP")"
if [ -n "$UPLOADS" ]; then UPLOADS="$(cd "$(dirname "$UPLOADS")" && pwd)/$(basename "$UPLOADS")"; fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [ "$YES" -ne 1 ]; then
  echo "This REPLACES the NUSAQUEST database${UPLOADS:+ and uploaded images} with:"
  echo "  $DUMP"
  [ -n "$UPLOADS" ] && echo "  $UPLOADS"
  read -r -p "Type 'restore' to continue: " answer
  [ "$answer" = "restore" ] || { echo "aborted"; exit 1; }
fi

echo "[restore] stopping app"
docker compose stop app

echo "[restore] waiting for database"
docker compose up -d --wait db

echo "[restore] restoring database (single transaction)"
docker compose exec -T db sh -c \
  'pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  <"$DUMP"

if [ -n "$UPLOADS" ]; then
  echo "[restore] replacing uploads volume"
  docker compose run --rm --no-deps -T --entrypoint sh app \
    -c 'find /app/data/uploads -mindepth 1 -delete && tar -xzf - -C /app/data/uploads' \
    <"$UPLOADS"
fi

echo "[restore] starting app"
docker compose up -d app
echo "[restore] done: check 'docker compose logs -f app' and GET /api/health"
