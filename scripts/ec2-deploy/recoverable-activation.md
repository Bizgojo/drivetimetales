# Recoverable activation procedure — Creek legacy recovery + webapp build

Scope: bring the EC2 host to the approved code, verify the DEPLOYED build is
healthy, and only then run the guarded `scripts/creek-legacy-recovery.ts`
(review branch `chore/creek-recovery-artifact`). All commands run on the EC2
host in `/home/ubuntu/drivetimetales` unless marked otherwise. NO
deploy/restart/unpause/recovery execution happens from artifact preparation —
this doc is procedure for review/approval.

Branch rule: this procedure never merges anything. It checks out an approved
tip, fast-forward only. Any divergence aborts (see step 1).

## 0. Correction first: in-place builds are recoverable, not unsafe

The earlier assurance ("in-place build is fine") was incomplete, not wrong:
`npm run build` overwrites `.next` in place, so a failed build leaves a
partial `.next` behind. The fix is a backup before build, not a separate
build host. With a `.next` backup + a recorded restore point, in-place build
is recoverable. Without them, it is not. This procedure makes the backup
mandatory (step 2).

## 1. Activation FIRST: code update → build → verify → restart → health checks

Nothing in steps 2–4 runs until step 1 has landed on the approved tip AND
the webapp health checks pass. Recovery never runs against an unverified
build.

### 1a. Approved code update (fetch + checkout approved tip, fast-forward only)

```bash
cd /home/ubuntu/drivetimetales
git fetch origin
git status --short  # must show a clean tree; stash or abort on any output
# Replace <approved-tip> with the reviewed commit or branch tip under approval:
git checkout <approved-tip> 2>/dev/null || git checkout -b tmp-activation <approved-tip>
git log --oneline -1  # record this commit as the activation tip
```

Fast-forward only: never `git pull` with merge, never `git reset --hard`,
never `git checkout .` on a dirty tree. If `git status --short` shows
local modifications, or the local tip has diverged from the approved tip
(`git rev-list --left-right --count HEAD...<approved-tip>` shows anything
on the left), ABORT — do not touch code, do not build, report the
divergence.

### 1b. Record the restore-point baseline (before any build or restart)

```bash
cd /home/ubuntu/drivetimetales
DEPLOYED_COMMIT=$(git rev-parse --short HEAD); echo "deployed commit: $DEPLOYED_COMMIT"
systemctl is-active endlesstales-webapp.service   # webapp state (the correct unit — see 1d)
systemctl is-active endlesstales-runnext.service  # expected: inactive (MUST stay stopped, see 1e)
crontab -l | head -n 20  # paused crontab state (record exact output)
```

Write the four values (activation-tip commit, webapp state, runnext
inactive, paused crontab) into the ops log before proceeding. They are the
rollback reference — never proceed without them.

### 1c. Recoverable webapp build (only if the activation tip differs from the running build)

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
```

### 1d. Restart webapp, then verify the DEPLOYED build (not checkout HEAD)

```bash
sudo systemctl restart endlesstales-webapp.service
sleep 15
systemctl is-active endlesstales-webapp.service      # must print: active
```

Health checks verify `endlesstales-webapp.service` — the unit that serves
traffic. (A prior revision of this doc checked the runnext unit here; that
was wrong: runnext is the job runner and MUST stay stopped during
activation. Checking it proves nothing about the serving build.)

```bash
cd /home/ubuntu/drivetimetales
echo "runtime commit: $(git rev-parse --short HEAD) (must equal the activation tip from 1a)"
curl -s -o /dev/null -w "stories API: %{http_code}\n" https://app.endless-tales.com/api/stories  # must print: 200
journalctl -u endlesstales-webapp.service --since "10 minutes ago" --no-pager | tail -n 30  # webapp.log clean: no exceptions, no boot loops
# success: webapp active + runtime commit == activation tip + stories API 200 + log clean
#   → optionally: rm -rf .next.bak.$SHORT (keep 24h first)
# any failure: restore .next backup (1c), restart webapp, re-verify, ABORT activation
```

Only after all four signals are green (active unit, runtime commit,
200, clean log) is the host eligible for step 3.

### 1e. endlesstales-runnext.service stays STOPPED; paused crontab preserved

```bash
systemctl is-active endlesstales-runnext.service  # must print: inactive — leave it stopped
```

Do NOT start runnext during activation. Do NOT restore any cron backup
file: restoring a backup would re-install the pre-pause schedule and
un-pause scheduled dispatch behind the operator's back. The paused
crontab recorded in 1b is the desired steady state — if a single entry
must change, edit that line only with `crontab -e` and re-verify paused
state afterwards.

## 2. Run the recovery script (dry-run first, always)

Only after step 1 is fully green:

```bash
cd /home/ubuntu/drivetimetales
npx tsx scripts/creek-legacy-recovery.ts            # read-only preflight dry run
npx tsx scripts/creek-legacy-recovery.ts --execute  # guarded writes (only after preflight green + explicit approval)
```

Crash recovery: re-run the same command. The script claims the job lock
first (`locked_by = creek-legacy-recovery`), re-verifies, and converges —
skipping already-verified steps without duplicate paid calls, finishing
through the same-job continuation to `series_generate_belle_assets`.

## 3. Pause-preserving rollback (cron rule)

On any rollback: NEVER restore a cron backup file wholesale — that would
un-pause scheduled dispatch (see 1e for the why). Leave the paused crontab
exactly as recorded in the baseline; edit single lines only with
`crontab -e` and re-verify paused state afterwards.

## 4. DB/asset writes are recovered by row re-read, never deleted to undo

If a recovery write must be backed out: re-read the affected row(s),
write a forward correction (new fenced update), verify read-after-write.
Never DELETE rows or NULL columns to "undo" — deletion destroys the audit
trail the next recovery depends on.
