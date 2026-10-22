# Recoverable activation procedure — Creek legacy recovery + webapp build

Scope: run the guarded `scripts/creek-legacy-recovery.mjs` (review branch
`chore/creek-recovery-artifact`) and, only if a webapp build is required,
rebuild safely. All commands run on the EC2 host in `/home/ubuntu/drivetimetales`
unless marked otherwise. NO deploy/restart/unpause/recovery execution happens
from artifact preparation — this doc is procedure for review/approval.

## 0. Correction first: in-place builds are recoverable, not unsafe

The earlier assurance ("in-place build is fine") was incomplete, not wrong:
`npm run build` overwrites `.next` in place, so a failed build leaves a
partial `.next` behind. The fix is a backup before build, not a separate
build host. With a `.next` backup + a recorded restore point, in-place build
is recoverable. Without them, it is not. This procedure makes the backup
mandatory.

## 1. Record the four-value restore-point baseline FIRST

```bash
cd /home/ubuntu/drivetimetales
DEPLOYED_COMMIT=$(git rev-parse --short HEAD); echo "deployed commit: $DEPLOYED_COMMIT"
systemctl is-active endlesstales-webapp.service   # webapp state
systemctl is-active runnext                        # expected: inactive (runnext stopped)
crontab -l | grep -c "^#" ; crontab -l | head -n 20  # paused crontab state (record exact output)
```

Write the four values (deployed commit, webapp state, runnext stopped,
paused crontab) into the ops log before proceeding. They are the rollback
reference — never proceed without them.

## 2. Run the recovery script (dry-run first, always)

```bash
cd /home/ubuntu/drivetimetales
node scripts/creek-legacy-recovery.mjs            # read-only preflight dry run
node scripts/creek-legacy-recovery.mjs --execute  # guarded writes (only after preflight green + explicit approval)
```

Crash recovery: re-run the same command. The script detects its own lock
(`locked_by = creek-legacy-recovery`), re-verifies, and converges —
skipping already-verified steps without duplicate paid calls.

## 3. Recoverable webapp build (only if needed)

```bash
cd /home/ubuntu/drivetimetales
SHORT=$(git rev-parse --short HEAD)
cp -r .next .next.bak.$SHORT                        # MANDATORY backup before build
npm run build || {
  echo "BUILD FAILED — restoring .next backup"
  rm -rf .next && mv .next.bak.$SHORT .next
  sudo systemctl restart endlesstales-webapp.service
  sleep 15
  echo "runtime commit: $(git rev-parse --short HEAD) (must equal $SHORT)"
  curl -s -o /dev/null -w "stories API: %{http_code}\n" https://app.endless-tales.com/api/stories
  exit 1
}
sudo systemctl restart endlesstales-webapp.service
sleep 15
curl -s -o /dev/null -w "stories API: %{http_code}\n" https://app.endless-tales.com/api/stories
# success: stories API 200 → optionally: rm -rf .next.bak.$SHORT (keep 24h first)
```

## 4. Pause-preserving rollback (cron rule)

On any rollback: NEVER restore a cron backup file wholesale — that would
un-pause scheduled dispatch. Instead, leave the paused crontab exactly as
recorded in the baseline; if a single entry must change, edit that line only
with `crontab -e` and re-verify paused state afterwards.

## 5. DB/asset writes are recovered by row re-read, never deleted to undo

If a recovery write must be backed out: re-read the affected row(s),
write a forward correction (new fenced update), verify read-after-write.
Never DELETE rows or NULL columns to "undo" — deletion destroys the audit
trail the next recovery depends on.
