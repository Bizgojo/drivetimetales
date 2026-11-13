#!/usr/bin/env bash
# WORKER-CURRENT-001 (Marc 2026-11-13): one-time switch of the background workers
# from ~/drivetimetales (never updated by deploys) to /home/ubuntu/et-current,
# which zero-downtime-deploy.sh points at the live slot on every deploy.
#
#   scripts/ec2-deploy/switch-workers-to-current.sh          # dry run: shows what would change
#   scripts/ec2-deploy/switch-workers-to-current.sh --apply  # does it
#
# Touches only: the et-current link, the worker unit files (backed up first),
# daemon-reload, and a restart of each worker. Never touches ~/drivetimetales,
# its .env.local, untracked files, crontab, Caddy or the web slots.
set -euo pipefail

APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
OLD="/home/ubuntu/drivetimetales"
CURRENT_LINK="${ET_CURRENT_LINK:-/home/ubuntu/et-current}"
UPSTREAM_FILE="${ET_UPSTREAM_FILE:-/etc/caddy/et-upstream.caddy}"
UNITS="endlesstales-runnext.service endlesstales-runnext-worker2.service endlesstales-poolworker.service endlesstales-renderworker.service endlesstales-progress-alarm.service"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

say() { echo "[$(date -u +%H:%M:%SZ)] $*"; }
run() { if [ "$APPLY" = 1 ]; then "$@"; else echo "  would run: $*"; fi; }

PORT="$(grep -oE 'localhost:[0-9]+' "$UPSTREAM_FILE" | head -1 | cut -d: -f2)"
LIVE="/home/ubuntu/et-slot-$PORT"
[ -d "$LIVE" ] || { say "live slot $LIVE not found — stopping"; exit 1; }
say "live slot: $LIVE ($(git -C "$LIVE" rev-parse --short=12 HEAD))"
for f in scripts/personalization/pool-worker.mjs scripts/render-worker/render-worker.mjs scripts/ec2-deploy/run-next-loop.sh scripts/ec2-deploy/run-next-loop-worker2.sh scripts/ec2-deploy/progress-alarm-call.sh; do
  [ -f "$LIVE/$f" ] || { say "missing in live slot: $f — stopping"; exit 1; }
done

run ln -sfn "$LIVE" "$CURRENT_LINK"

for unit in $UNITS; do
  path="$(systemctl show -p FragmentPath --value "$unit" 2>/dev/null || true)"
  [ -n "$path" ] && [ -f "$path" ] || { say "$unit: no unit file — skipped"; continue; }
  if ! grep -q "$OLD/" "$path" && ! grep -q "^WorkingDirectory=$OLD\$" "$path"; then say "$unit: already off $OLD — skipped"; continue; fi
  say "$unit: $path"
  grep -nE "^(WorkingDirectory|ExecStart)=" "$path" | sed 's/^/    before: /'
  run sudo cp -p "$path" "$path.bak-$STAMP"
  run sudo sed -i -E "s#^WorkingDirectory=$OLD\$#WorkingDirectory=$CURRENT_LINK#; s#^(ExecStart=.*)$OLD/#\\1$CURRENT_LINK/#" "$path"
done

run sudo systemctl daemon-reload
for unit in endlesstales-runnext.service endlesstales-runnext-worker2.service endlesstales-poolworker.service endlesstales-renderworker.service; do
  if systemctl is-active --quiet "$unit"; then
    if [ "$unit" = "endlesstales-renderworker.service" ] && ! sudo journalctl -u "$unit" -n 1 --no-pager -o cat 2>/dev/null | grep -q "No local render jobs queued"; then
      say "render worker busy — restart it later: sudo systemctl restart $unit"; continue
    fi
    run sudo systemctl restart "$unit"
  fi
done
say "done (apply=$APPLY). Crontab entries were not changed."
