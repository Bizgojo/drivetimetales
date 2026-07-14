#!/bin/bash
# OpenClaw auto-recovery watchdog — no AI, pure plumbing
LOG=~/Projects/drivetimetales/scripts/watchdog/watchdog.log
TS=$(date '+%Y-%m-%d %H:%M:%S')
# 1) Gateway process alive?
if ! pgrep -f "openclaw.*gateway" > /dev/null 2>&1; then
  echo "$TS gateway DOWN — restarting" >> "$LOG"
  /usr/local/bin/openclaw gateway restart >> "$LOG" 2>&1 || openclaw gateway restart >> "$LOG" 2>&1
fi
# 2) Any agent in billing cooldown? Clear it.
for a in orion main atlas susan maya vega; do
  DB=~/.openclaw/agents/$a/agent/openclaw-agent.sqlite
  [ -f "$DB" ] || continue
  if sqlite3 "$DB" "SELECT state_json FROM auth_profile_state;" 2>/dev/null | grep -q disabledUntil; then
    echo "$TS cooldown found on $a — clearing" >> "$LOG"
    sqlite3 "$DB" "UPDATE auth_profile_state SET state_json='{\"version\":1,\"lastGood\":{\"anthropic\":\"anthropic:default\"},\"usageStats\":{\"anthropic:default\":{\"lastUsed\":1783616723504}}}' WHERE state_key='primary';" 2>/dev/null
    NEED_RESTART=1
  fi
done
[ -n "$NEED_RESTART" ] && { echo "$TS restarting after cooldown clear" >> "$LOG"; openclaw gateway restart >> "$LOG" 2>&1; }
exit 0
