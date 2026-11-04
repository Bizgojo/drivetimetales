#!/usr/bin/env bash
# Endless Tales — progress-alarm call (Stabilization Week Day1A fixes, PR #478)
#
# Single scan pass: GETs /api/admin/progress-alarm, which checks every
# non-terminal production job for saved-artifact progress and raises a
# stuck alert (BUSY + NOT SAVING 30min) or a daily waiting-on-Marc
# reminder. Driven every 5min by endlesstales-progress-alarm.timer.
#
# Required env (set in ~/drivetimetales/.env.local on the EC2 box):
#   ADMIN_INTERNAL_TOKEN  machine secret (32+ chars); must match the
#                         server's ADMIN_INTERNAL_TOKEN. Accepted for this
#                         path only after PR #478 merges + deploys (the
#                         INTERNAL_ADMIN_PATHS entry ships in that PR).
#                         Until then the route answers 403 and this script
#                         just logs the code — no state changes on 403.
# Optional env:
#   PROGRESS_ALARM_URL    default https://app.endless-tales.com/api/admin/progress-alarm
#   PROGRESS_ALARM_MAX_SECONDS  curl cap, default 60
set -euo pipefail

ENV_FILE="$HOME/drivetimetales/.env.local"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

URL="${PROGRESS_ALARM_URL:-https://app.endless-tales.com/api/admin/progress-alarm}"
MAX_SECONDS="${PROGRESS_ALARM_MAX_SECONDS:-60}"
RESPONSE_FILE="${PROGRESS_ALARM_RESPONSE_FILE:-/tmp/progress-alarm-last-response.json}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

if [ -n "${ADMIN_INTERNAL_TOKEN:-}" ]; then
  HTTP_CODE=$(curl -sS --max-time "$MAX_SECONDS" -o "$RESPONSE_FILE" -w "%{http_code}" \
    -X GET -H "x-et-internal-key: ${ADMIN_INTERNAL_TOKEN}" \
    "$URL" || echo "000")
else
  HTTP_CODE=$(curl -sS --max-time "$MAX_SECONDS" -o "$RESPONSE_FILE" -w "%{http_code}" \
    -X GET \
    "$URL" || echo "000")
fi

if [ "$HTTP_CODE" = "000" ]; then
  log "progress-alarm call failed (network/timeout)"
elif [ "$HTTP_CODE" = "200" ]; then
  STUCK=$(python3 -c "import json;print(json.load(open('$RESPONSE_FILE')).get('stuckCount','?'))" 2>/dev/null || echo "?")
  ALERTS=$(python3 -c "import json;print(json.load(open('$RESPONSE_FILE')).get('alertsSent','?'))" 2>/dev/null || echo "?")
  log "progress-alarm scan OK HTTP 200 stuckCount=${STUCK} alertsSent=${ALERTS}"
else
  log "progress-alarm responded HTTP $HTTP_CODE (expected 200; 403 = PR #478 not yet merged/deployed, no state changed)"
fi
