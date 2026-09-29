#!/usr/bin/env bash
# NUSAQUEST one-shot backup from the Docker host (cron or deploy/systemd/nusaquest-backup.timer).
#
#   deploy/backup/backup.sh                    # → ./backups/nusaquest-<ts>.dump + uploads-<ts>.tar.gz
#   BACKUP_DIR=/mnt/nas/nusaquest BACKUP_KEEP_DAYS=30 deploy/backup/backup.sh
#
# Needs the compose stack running (db for pg_dump, app for the uploads volume). The
# compose "backup" profile does the same thing on a loop inside a container; use one or
# the other. Restore with deploy/backup/restore.sh.

set -euo pipefail
# Git Bash on Windows would rewrite container paths such as /app/data/uploads; no-op on Linux.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$BACKUP_DIR/nusaquest-$TS.dump"
UPLOADS="$BACKUP_DIR/uploads-$TS.tar.gz"

mkdir -p "$BACKUP_DIR"
# Never leave a half-written file behind that could be mistaken for a backup.
trap 'rm -f "$DUMP.partial" "$UPLOADS.partial"' EXIT
umask 077 # dumps contain lecturer accounts and student nicknames

echo "[backup] database → $DUMP"
docker compose exec -T db sh -c \
  'pg_dump --format=custom --compress=6 --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  >"$DUMP.partial"
mv "$DUMP.partial" "$DUMP"

echo "[backup] uploads  → $UPLOADS"
docker compose exec -T app tar -czf - -C /app/data/uploads . >"$UPLOADS.partial"
mv "$UPLOADS.partial" "$UPLOADS"

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'nusaquest-*.dump' -o -name 'uploads-*.tar.gz' \) \
  -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/[backup] pruned /'

echo "[backup] done ($(du -h "$DUMP" | cut -f1) database, $(du -h "$UPLOADS" | cut -f1) uploads)"
