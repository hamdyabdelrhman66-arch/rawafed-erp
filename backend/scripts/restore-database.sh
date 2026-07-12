#!/bin/sh
set -eu
umask 077

: "${RESTORE_FILE:?RESTORE_FILE is required}"
: "${RESTORE_CONFIRMATION:?Set RESTORE_CONFIRMATION=RESTORE_RAWAFED_DATA}"
test "$RESTORE_CONFIRMATION" = "RESTORE_RAWAFED_DATA" || { echo "Invalid restore confirmation" >&2; exit 1; }
test -f "$RESTORE_FILE" || { echo "Restore file does not exist" >&2; exit 1; }
test -f "$RESTORE_FILE.sha256" && sha256sum -c "$RESTORE_FILE.sha256"

: "${DATABASE_URL:?DATABASE_URL is required}"
pg_restore --list "$RESTORE_FILE" >/dev/null
pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner --no-privileges --single-transaction "$RESTORE_FILE"

echo "Restore completed and must now pass readiness and reconciliation checks."
