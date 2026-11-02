# EC2 deploy — Phase 1 (cloud pipeline stand-up)

Three systemd services, meant to replace the two macOS launchd plists
(`com.endlesstales.renderworker`, `com.endlesstales.poolworker`) plus add
the one piece that never existed anywhere: an automatic loop driving
`run-next`.

**Safety split — read before installing:**
- `endlesstales-renderworker.service` and `endlesstales-poolworker.service`
  are safe to start now. They only process jobs that already exist in
  `production_jobs` (local audio mix, personalization pool). They do not
  publish anything.
- `endlesstales-runnext.service` is NOT safe to start yet. `run-next` is
  the step that can promote a story to `published` (publish_mode is
  currently `direct`). Install it, but leave it **disabled/stopped** until
  Marc gives the explicit "go live" word for Phase 1's first unattended
  premise→publish run.

## Install (run as the SSH user on the EC2 box, inside ~/drivetimetales)

```bash
git pull origin main

sudo cp scripts/ec2-deploy/endlesstales-renderworker.service /etc/systemd/system/
sudo cp scripts/ec2-deploy/endlesstales-poolworker.service /etc/systemd/system/
sudo cp scripts/ec2-deploy/endlesstales-runnext.service /etc/systemd/system/
chmod +x scripts/ec2-deploy/run-next-loop.sh

sudo systemctl daemon-reload

# Safe to start now:
sudo systemctl enable --now endlesstales-renderworker.service
sudo systemctl enable --now endlesstales-poolworker.service

# Install but do NOT start yet:
sudo systemctl enable endlesstales-runnext.service
```

## Verify the two safe workers are running

```bash
systemctl status endlesstales-renderworker.service --no-pager
systemctl status endlesstales-poolworker.service --no-pager
tail -20 scripts/render-worker/render-worker.log
tail -20 scripts/personalization/pool-worker.log
```

## When Marc gives the go-live word

```bash
sudo systemctl start endlesstales-runnext.service
tail -f scripts/ec2-deploy/run-next-loop.log
```

To stop it again (e.g. to re-impose the hold):

```bash
sudo systemctl stop endlesstales-runnext.service
```

## Open side issue (flagged, not fixed here)

`POST /api/admin/production-jobs/run-next` has no auth check in the route
itself (confirmed by reading the code, not assumed) — the Bearer-token
example in docs/DEPLOYMENT-RUNBOOK.md doesn't correspond to any check this
route actually performs. `run-next-loop.sh` sends `RUN_NEXT_ADMIN_TOKEN` as
a header if set (harmless no-op today, ready if auth is added later), but
this is worth a separate security pass — anyone with the URL can currently
trigger it.

## Zero-downtime deploys (ZERO-DOWNTIME-001, Marc 2026-11-02)

Every deploy used to rebuild `.next` under the running app and restart it:
~5 minutes of 502s (uptime alerts) and jobs cut off mid-step. Now each
release is built in an idle slot and Caddy switches to it only when it is healthy.

### One-time setup (Orion)

1. `sudo cp scripts/ec2-deploy/endlesstales-webapp@.service /etc/systemd/system/ && sudo systemctl daemon-reload`
2. In the Caddyfile, replace the site's `reverse_proxy localhost:3000` line with
   `import /etc/caddy/et-upstream.caddy`, then
   `echo "reverse_proxy localhost:3000" | sudo tee /etc/caddy/et-upstream.caddy`
   and `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.
   (Nothing changes for listeners: it still points at the current app.)
3. `chmod +x scripts/ec2-deploy/zero-downtime-deploy.sh`

### Every deploy after that

`scripts/ec2-deploy/zero-downtime-deploy.sh <commit>` — builds in the idle slot
(3001 or 3002), waits for `/api/version` to report that commit, switches Caddy,
lets the old slot finish open requests (up to 20 min), then stops it. The first
run moves the app off the old `endlesstales-webapp.service` (port 3000).
A failed build or health check leaves the live app untouched.
Logs: `scripts/ec2-deploy/build-<port>.log`, `webapp-<port>.log`.
The run-next loop, render and pool workers are unchanged (they call the public URL).
