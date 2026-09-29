#!/bin/sh
# NUSAQUEST backup loop for the compose "backup" profile (runs inside postgres:17-alpine).
#
# Every BACKUP_INTERVAL_SECONDS (default 86400 = daily) it writes into /backups:
#   nusaquest-<UTC timestamp>.dump      pg_dump custom format (restore with pg_restore)
#   uploads-<UTC timestamp>.tar.gz      the question-image volume (mounted read-only at /uploads)
# and deletes files older than BACKUP_KEEP_DAYS (default 14).
#
# Connection settings come from the standard libpq variables (PGHOST, PGUSER, PGPASSWORD,
# PGDATABASE) set in docker-compose.yml. The first backup runs immediately at start.
# Copy /backups off the server (Proxmox Backup Server, rsync, NAS): a backup that lives
# only on the same disk is not a backup.

set -eu

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
OUT="/backups"

mkdir -p "$OUT"

log() {
  echo "[backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
}

run_backup() {
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  dump="$OUT/nusaquest-$ts.dump"
  uploads="$OUT/uploads-$ts.tar.gz"

  # Write to a temporary name first so a half-written dump is never mistaken for a good one.
  if pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$dump.partial"; then
    mv "$dump.partial" "$dump"
    log "database → $(basename "$dump") ($(du -h "$dump" | cut -f1))"
  else
    rm -f "$dump.partial"
    log "ERROR: pg_dump failed"
    return 1
  fi

  if [ -d /uploads ]; then
    if tar -czf "$uploads.partial" -C /uploads .; then
      mv "$uploads.partial" "$uploads"
      log "uploads  → $(basename "$uploads") ($(du -h "$uploads" | cut -f1))"
    else
      rm -f "$uploads.partial"
      log "ERROR: uploads archive failed"
    fi
  fi

  # Retention: only our own file patterns, never anything else in the folder.
  find "$OUT" -maxdepth 1 -type f \( -name 'nusaquest-*.dump' -o -name 'uploads-*.tar.gz' \) \
    -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/[backup] pruned /'
}

log "started: every ${INTERVAL}s, keeping ${KEEP_DAYS} days, database ${PGDATABASE:-?}@${PGHOST:-?}"

# Stop cleanly on `docker compose stop` instead of waiting out the sleep.
trap 'log "stopping"; exit 0' TERM INT

while true; do
  run_backup || true
  sleep "$INTERVAL" &
  wait $!
done
