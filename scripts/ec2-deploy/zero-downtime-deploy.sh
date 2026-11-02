#!/usr/bin/env bash
# ZERO-DOWNTIME-001 (Marc 2026-11-02): deploy without taking the app down.
#
#   scripts/ec2-deploy/zero-downtime-deploy.sh <commit>
#
# 1. Build <commit> in the IDLE slot (/home/ubuntu/et-slot-3001 or -3002)
#    while the live slot keeps serving.
# 2. Start it on its own port and wait until /api/version answers with
#    this build.
# 3. Point Caddy at it (graceful reload — no dropped requests).
# 4. Let the old slot finish its open requests (up to DRAIN_MAX_SECONDS),
#    then stop it.
# Any failure before step 3 stops the new slot and leaves the live app as it was.
set -euo pipefail

COMMIT="${1:?usage: zero-downtime-deploy.sh <commit>}"
MAIN="${ET_MAIN_DIR:-/home/ubuntu/drivetimetales}"
UPSTREAM_FILE="${ET_UPSTREAM_FILE:-/etc/caddy/et-upstream.caddy}"
DRAIN_MAX_SECONDS="${DRAIN_MAX_SECONDS:-1200}"
HEALTH_MAX_SECONDS="${HEALTH_MAX_SECONDS:-180}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

active_port() {
  if [ -f "$UPSTREAM_FILE" ]; then grep -oE 'localhost:[0-9]+' "$UPSTREAM_FILE" | head -1 | cut -d: -f2; else echo 3000; fi
}

ACTIVE="$(active_port)"
if [ "$ACTIVE" = "3001" ]; then TARGET=3002; else TARGET=3001; fi
SLOT="/home/ubuntu/et-slot-$TARGET"
log "live slot: $ACTIVE  →  building $COMMIT in slot $TARGET ($SLOT)"

# 1. Code for the new release (a worktree shares the repo; no second clone).
git -C "$MAIN" fetch -q origin
if [ ! -d "$SLOT/.git" ] && [ ! -f "$SLOT/.git" ]; then
  git -C "$MAIN" worktree add --detach "$SLOT" "$COMMIT"
else
  git -C "$SLOT" checkout -q --detach "$COMMIT"
fi
ln -sfn "$MAIN/.env.local" "$SLOT/.env.local"

# Dependencies: reuse the main install when the lockfile is identical.
if cmp -s "$MAIN/package-lock.json" "$SLOT/package-lock.json" && [ -d "$MAIN/node_modules" ]; then
  [ -L "$SLOT/node_modules" ] || { rm -rf "$SLOT/node_modules"; ln -s "$MAIN/node_modules" "$SLOT/node_modules"; }
else
  log "package-lock.json changed — installing dependencies in the slot"
  rm -f "$SLOT/node_modules"
  (cd "$SLOT" && npm ci --no-audit --no-fund)
fi

log "building…"
(cd "$SLOT" && NEXT_TELEMETRY_DISABLED=1 npm run build) > "$MAIN/scripts/ec2-deploy/build-$TARGET.log" 2>&1 || {
  log "BUILD FAILED — live app untouched. See scripts/ec2-deploy/build-$TARGET.log"; exit 1; }

# 2. Start the new slot and wait until it answers as this build.
sudo systemctl restart "endlesstales-webapp@$TARGET.service"
SHORT="$(git -C "$SLOT" rev-parse --short=12 HEAD)"
deadline=$(( $(date +%s) + HEALTH_MAX_SECONDS ))
until curl -fsS --max-time 5 "http://localhost:$TARGET/api/version" | grep -q "\"version\":\"$SHORT"; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    log "NEW SLOT NOT HEALTHY after ${HEALTH_MAX_SECONDS}s — stopping it; live app untouched"
    sudo systemctl stop "endlesstales-webapp@$TARGET.service"
    exit 1
  fi
  sleep 3
done
curl -fsS --max-time 10 -o /dev/null "http://localhost:$TARGET/api/stories" || log "warning: /api/stories on the new slot did not return 2xx"
log "slot $TARGET healthy as $SHORT"

# 3. Switch Caddy (graceful).
echo "reverse_proxy localhost:$TARGET" | sudo tee "$UPSTREAM_FILE" > /dev/null
sudo systemctl reload caddy
sleep 2
log "Caddy now → localhost:$TARGET"

# 4. Drain and stop the old slot.
if [ "$ACTIVE" = "3000" ]; then OLD_UNIT="endlesstales-webapp.service"; else OLD_UNIT="endlesstales-webapp@$ACTIVE.service"; fi
deadline=$(( $(date +%s) + DRAIN_MAX_SECONDS ))
while true; do
  open="$(ss -Htn state established "( sport = :$ACTIVE )" 2>/dev/null | wc -l | tr -d ' ')"
  [ "$open" = "0" ] && break
  if [ "$(date +%s)" -ge "$deadline" ]; then log "old slot still has $open open request(s) after ${DRAIN_MAX_SECONDS}s — stopping anyway (jobs resume on their own)"; break; fi
  sleep 10
done
sudo systemctl stop "$OLD_UNIT"
[ "$ACTIVE" = "3000" ] && sudo systemctl disable "$OLD_UNIT" > /dev/null 2>&1 || true
sudo systemctl enable "endlesstales-webapp@$TARGET.service" > /dev/null 2>&1 || true
log "DONE — live: slot $TARGET ($SHORT); old slot $ACTIVE stopped"
