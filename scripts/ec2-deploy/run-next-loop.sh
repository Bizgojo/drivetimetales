#!/usr/bin/env bash
# Endless Tales — run-next loop (Phase 1, EC2)
#
# Drives the pipeline step-advancer automatically. Until this script's
# systemd service is STARTED, nothing calls run-next on a loop — jobs sit
# where they are. Do not start endlesstales-runnext.service until Marc has
# given the explicit "go live" word (publish_mode is currently 'direct',
# so once this loop runs, ready_for_review stories WILL auto-publish).
#
# Required env (set in ~/drivetimetales/.env.local or exported before start):
#   RUN_NEXT_URL            e.g. https://app.endless-tales.com/api/admin/production-jobs/run-next
#   RUN_NEXT_ADMIN_TOKEN    optional — the route currently has no auth check,
#                           but send it anyway if/when one is added (ATL-OPS
#                           side note: this endpoint is unauthenticated today).
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

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

log "run-next loop starting — URL=$URL interval=${INTERVAL_SECONDS}s"

while true; do
  if [ -n "${RUN_NEXT_ADMIN_TOKEN:-}" ]; then
    AUTH_HEADER=(-H "Authorization: Bearer ${RUN_NEXT_ADMIN_TOKEN}")
  else
    AUTH_HEADER=()
  fi

  HTTP_CODE=$(curl -sS -o /tmp/run-next-last-response.json -w "%{http_code}" \
    -X POST "${AUTH_HEADER[@]}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "$URL" || echo "000")

  if [ "$HTTP_CODE" = "000" ]; then
    log "run-next call failed (network/timeout)"
  else
    log "run-next responded HTTP $HTTP_CODE"
  fi

  sleep "$INTERVAL_SECONDS"
done
