#!/bin/sh
set -eu
umask 077

: "${BACKUP_DIR:=./backups/postgresql}"
: "${BACKUP_RETENTION_DAYS:=30}"
mkdir -p "$BACKUP_DIR"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$BACKUP_DIR/rawafed-$timestamp.dump"

: "${DATABASE_URL:?DATABASE_URL is required}"
command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is required" >&2; exit 1; }
pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 --no-owner --no-privileges --file="$file"
pg_restore --list "$file" >/dev/null

sha256sum "$file" > "$file.sha256"
find "$BACKUP_DIR" -type f -mtime "+$BACKUP_RETENTION_DAYS" -delete
echo "$file"
