#!/bin/bash
# Orion liveness watcher — Atlas Gap-3 (Marc decisions 2026-10-11 14:11 EDT)
#
# DETECT + ALERT ONLY. NEVER restarts Orion, never touches the DB,
# never runs recovery actions (Marc rule 2026-07-10).
#
# Signal: heartbeat-state.json written by Orion heartbeats. If the file
# mtime AND the newest lastChecks timestamp are both older than
# STALE_MINUTES (45), Orion is presumed dead/silent -> critical Telegram
# alert via direct Bot API (independent of the OpenClaw gateway, same
# mechanism as the alerting watchdog).
#
# Config (env-overridable):
#   HEARTBEAT_FILE   default ~/.openclaw/workspace-orion/memory/heartbeat-state.json
#   STALE_MINUTES    default 45
#   COOLDOWN_MINUTES default 30 (re-alert while still dead)
#   SENTINEL_FILE    default ~/.openclaw/workspace-orion/memory/MONITORING_PAUSED
#                    if present, watcher exits silently (no alerts)
#   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID  required for send; if unset,
#                    the alert is logged but NOT sent (fail-open logging,
#                    never crash, never block).
#   STATE_FILE       default <script-dir>/orion-liveness.state (last alert epoch)
#   LOG_FILE         default <script-dir>/orion-liveness.log
#
# Quiet hours: BYPASSED for this check. Orion-silence is critical and
# notifies immediately at any hour (Marc decision gap3-quiet-oct11-1411).
#
# Dependencies: bash, stat, date, python3 (JSON parse), curl. No AI models
# (models-down rule).

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HEARTBEAT_FILE="${HEARTBEAT_FILE:-$HOME/.openclaw/workspace-orion/memory/heartbeat-state.json}"
STALE_MINUTES="${STALE_MINUTES:-45}"
COOLDOWN_MINUTES="${COOLDOWN_MINUTES:-30}"
SENTINEL_FILE="${SENTINEL_FILE:-$HOME/.openclaw/workspace-orion/memory/MONITORING_PAUSED}"
STATE_FILE="${STATE_FILE:-$SCRIPT_DIR/orion-liveness.state}"
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/orion-liveness.log}"

NOW=$(date +%s)
TS=$(date '+%Y-%m-%d %H:%M:%S')

log() { echo "$TS $*" >> "$LOG_FILE"; }

# 0) Sentinel: monitoring paused -> silent exit, no alert, no state change.
if [ -f "$SENTINEL_FILE" ]; then
  log "MONITORING_PAUSED sentinel present — skipping check"
  exit 0
fi

# 1) Heartbeat file must exist. Missing file = no signal = treat as stale
#    (heartbeats should create it) BUT only alert; never create/repair it.
if [ ! -f "$HEARTBEAT_FILE" ]; then
  AGE_MIN="unknown (file missing)"
  STALE=1
  DETAIL="heartbeat-state.json missing at $HEARTBEAT_FILE"
else
  MTIME=$(stat -f %m "$HEARTBEAT_FILE" 2>/dev/null || stat -c %Y "$HEARTBEAT_FILE" 2>/dev/null || echo "")
  if [ -z "$MTIME" ]; then
    log "ERROR: cannot stat $HEARTBEAT_FILE — skipping (no alert, needs human)"
    exit 0
  fi
  FILE_AGE_MIN=$(( (NOW - MTIME) / 60 ))

  # Newest lastChecks value (epoch seconds). Missing/unparseable -> 0 (very stale).
  MAX_CHECK=$(python3 -c "
import json,sys
try:
  d=json.load(open('$HEARTBEAT_FILE'))
  lc=d.get('lastChecks') or {}
  vals=[v for v in lc.values() if isinstance(v,(int,float))]
  print(int(max(vals)) if vals else 0)
except Exception:
  print(0)
" 2>/dev/null || echo "0")
  if [ "$MAX_CHECK" -gt 0 ]; then
    CHECK_AGE_MIN=$(( (NOW - MAX_CHECK) / 60 ))
  else
    CHECK_AGE_MIN=999999
  fi

  # Stale only if BOTH file mtime and newest check are old (avoids false
  # positives from a writer that touches the file without updating content,
  # and vice versa).
  if [ "$FILE_AGE_MIN" -gt "$STALE_MINUTES" ] && [ "$CHECK_AGE_MIN" -gt "$STALE_MINUTES" ]; then
    STALE=1
    AGE_MIN="file=${FILE_AGE_MIN}m checks=${CHECK_AGE_MIN}m"
    DETAIL="heartbeat-state.json stale: file mtime ${FILE_AGE_MIN}m ago, newest lastCheck ${CHECK_AGE_MIN}m ago (threshold ${STALE_MINUTES}m)"
  else
    STALE=0
    log "OK file=${FILE_AGE_MIN}m checks=${CHECK_AGE_MIN}m"
  fi
fi

# 2) Fresh -> clear any dead-state and exit.
if [ "${STALE:-0}" -eq 0 ]; then
  [ -f "$STATE_FILE" ] && rm -f "$STATE_FILE"
  exit 0
fi

# 3) Stale -> cooldown: re-alert at most once per COOLDOWN_MINUTES while dead.
LAST_ALERT=0
[ -f "$STATE_FILE" ] && LAST_ALERT=$(cat "$STATE_FILE" 2>/dev/null || echo "0")
case "$LAST_ALERT" in ''|*[!0-9]*) LAST_ALERT=0 ;; esac
ELAPSED_MIN=$(( (NOW - LAST_ALERT) / 60 ))
if [ "$LAST_ALERT" -gt 0 ] && [ "$ELAPSED_MIN" -lt "$COOLDOWN_MINUTES" ]; then
  log "STALE ($DETAIL) — cooldown active (${ELAPSED_MIN}m < ${COOLDOWN_MINUTES}m), suppressing"
  exit 0
fi

# 4) Alert. Quiet-hours BYPASS: critical Orion-silence notifies immediately.
MSG="🔴 MARC ACTION — Orion silent ${AGE_MIN:-stale}
${DETAIL}
Threshold: ${STALE_MINUTES}m | Re-alert cooldown: ${COOLDOWN_MINUTES}m
Watcher NEVER restarts Orion (detect+alert only). Check gateway/host."

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  if curl -s --max-time 20 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$MSG" >> "$LOG_FILE" 2>&1; then
    echo "$NOW" > "$STATE_FILE"
    log "ALERT SENT ($DETAIL)"
  else
    log "ALERT SEND FAILED ($DETAIL) — will retry next run (no cooldown set)"
  fi
else
  log "ALERT NOT SENT — TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID unset ($DETAIL)"
  echo "$NOW" > "$STATE_FILE"
fi
exit 0
