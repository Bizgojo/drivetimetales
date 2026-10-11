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
