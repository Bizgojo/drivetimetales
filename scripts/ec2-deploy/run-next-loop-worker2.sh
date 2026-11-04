#!/usr/bin/env bash
# Endless Tales — run-next loop, WORKER 2 (EC2)
#
# Second run-next driver (commission ops-worker2-402-20261104, Marc order
# 2026-11-04). Identical to scripts/ec2-deploy/run-next-loop.sh EXCEPT it
# posts {"holderId":"run-next-worker2"} so the server treats it as a
# DISTINCT holder from the default `run-next:<pid>` holder used by worker 1.
#
# Safety basis (verified in app/api/admin/production-jobs/run-next/route.ts):
#   - POST body.holderId overrides the server default WORKER_ID.
#   - lockJob() is an atomic conditional UPDATE: exactly one holder wins
#     each row (queued+unlocked, or stale lock only).
#   - ONE-JOB-PER-WORKER guard is scoped per holder (locked_by = holderId),
#     so worker 1 holding job X never blocks worker 2 from locking job Y.
#   - All step writes are fenced on (id, locked_by, locked_at,
#     status='running') via ownedJobFence — a holder can never overwrite
#     another holder's row.
#   - DB unique indexes one_active_per_series / one_active_per_story mean two
#     holders necessarily work different series/stories: no double-voicing.
#   - run-next never INSERTs jobs, so a second loop cannot duplicate work.
#
# Env (same ~/drivetimetales/.env.local as worker 1):
#   RUN_NEXT_URL, RUN_NEXT_ADMIN_TOKEN / ADMIN_INTERNAL_TOKEN (optional),
#   RUN_NEXT_POLL_INTERVAL_SECONDS (default 30),
#   RUN_NEXT_MAX_SECONDS (default 1200),
#   RUN_NEXT_HOLDER_ID (default run-next-worker2 — do NOT set to {}-style
#     empty; must stay distinct from worker 1's default holder).
set -euo pipefail

ENV_FILE="$HOME/drivetimetales/.env.local"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

URL="${RUN_NEXT_URL:-https://app.endless-tales.com/api/admin/production-jobs/run-next}"
INTERVAL_SECONDS="${RUN_NEXT_POLL_INTERVAL_SECONDS:-30}"
MAX_SECONDS="${RUN_NEXT_MAX_SECONDS:-1200}"
HOLDER_ID="${RUN_NEXT_HOLDER_ID:-run-next-worker2}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [worker2:$HOLDER_ID] $*"; }

log "run-next loop (worker2) starting — URL=$URL interval=${INTERVAL_SECONDS}s holder=$HOLDER_ID"

while true; do
  # HYGIENE-20261104b: per-worker curl config (no shared .tmp race).
  # umask 077 subshell: bearer file never readable by others, even briefly.
  BEARER_CONFIG="$HOME/.run-next-curl-config-worker2"
  TOK="${ADMIN_INTERNAL_TOKEN:-${RUN_NEXT_ADMIN_TOKEN:-}}"
  if [ -n "$TOK" ]; then
    ( umask 077; printf 'header = "Authorization: Bearer %s"\n' "$TOK" > "$BEARER_CONFIG.tmp" && mv -f "$BEARER_CONFIG.tmp" "$BEARER_CONFIG" )
    CURL_AUTH=(-K "$BEARER_CONFIG")
  else
    CURL_AUTH=()
  fi

  BODY=$(printf '{"holderId":"%s"}' "$HOLDER_ID")
  HTTP_CODE=$(curl -sS --max-time "$MAX_SECONDS" -o /tmp/run-next-worker2-last-response.json -w "%{http_code}" \
    -X POST "${CURL_AUTH[@]}" \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    "$URL" || echo "000")

  if [ "$HTTP_CODE" = "000" ]; then
    log "run-next call failed (network/timeout)"
  else
    log "run-next responded HTTP $HTTP_CODE"
  fi

  sleep "$INTERVAL_SECONDS"
done
