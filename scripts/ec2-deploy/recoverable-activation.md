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

Every step below runs with fail-fast semantics (`set -euo pipefail` at the
top of each script block; any non-zero exit or unset variable aborts the
step immediately). Each step lists its explicit abort conditions — on any
abort, stop, do not proceed to later steps, report.

### 1a. Record the restore point FIRST (previous source + build identity, before changing anything)

The restore point is the OLD source, not the new candidate: capture it
BEFORE any checkout, build, or restart. Recording a commit hash after
checkout would record the new candidate and destroy the rollback
reference — never do that.

```bash
set -euo pipefail
cd /home/ubuntu/drivetimetales
PREV_COMMIT=$(git rev-parse HEAD); echo "previous source commit: $PREV_COMMIT"
PREV_BUILD_ID=$(cat .next/BUILD_ID); echo "previous build id: $PREV_BUILD_ID"  # current .next build identity on the host
systemctl is-active endlesstales-webapp.service || true   # webapp state, record only (never abort the restore-point capture — see 1d)
[ "$(systemctl is-active endlesstales-runnext.service || true)" = "inactive" ]  # expected: inactive (MUST stay stopped, see 1e)
crontab -l | head -n 20  # paused crontab state (record exact output)
```

Write the five values (previous source commit, previous build id, webapp
state, runnext inactive, paused crontab) into the ops log before
proceeding. They are the rollback reference — never proceed without them.

Abort conditions: `.next/BUILD_ID` unreadable (unknown serving build —
stop and report, do not build blind); runnext anything but `inactive`;
`crontab -l` failing (crontab state unknown — do not touch scheduling).

### 1b. Approved code update (fetch + checkout approved tip, fast-forward only)

```bash
set -euo pipefail
cd /home/ubuntu/drivetimetales
git fetch origin
git status --short  # must show a clean tree; stash or abort on any output
# Replace <approved-tip> with the reviewed commit or branch tip under approval:
git checkout <approved-tip> 2>/dev/null || git checkout -b tmp-activation <approved-tip>
ACTIVATION_TIP=$(git rev-parse HEAD); echo "activation tip: $ACTIVATION_TIP"  # the NEW candidate — not the restore point
```

Fast-forward only: never `git pull` with merge, never `git reset --hard`,
never `git checkout .` on a dirty tree. If `git status --short` shows
local modifications, or the local tip has diverged from the approved tip
(`git rev-list --left-right --count HEAD...<approved-tip>` shows anything
on the left), ABORT — do not touch code, do not build, report the
divergence.

### 1c. Recoverable webapp build (only if the activation tip differs from the running build)

```bash
set -euo pipefail
cd /home/ubuntu/drivetimetales
SHORT=$(git rev-parse --short HEAD)
cp -r .next .next.bak.$SHORT                        # MANDATORY backup before build
npm run build || {
  echo "BUILD FAILED — restoring .next backup"
  rm -rf .next && mv .next.bak.$SHORT .next
  sudo systemctl restart endlesstales-webapp.service
  sleep 15
  NEW_BUILD_ID=$(cat .next/BUILD_ID); echo "restored build id: $NEW_BUILD_ID (must equal $PREV_BUILD_ID from 1a)"
  [ "$NEW_BUILD_ID" = "$PREV_BUILD_ID" ]  # abort if the restore did not reproduce the previous build identity
  curl -s -o /dev/null -w "stories API: %{http_code}\n" https://app.endless-tales.com/api/stories
  exit 1
}
```

Abort conditions: backup copy failing (no backup — do not build);
`npm run build` non-zero (restore path above, then ABORT activation — do
not restart into a partial `.next`, do not proceed to 1d). runnext stays
STOPPED throughout (see 1e); the paused crontab recorded in 1a is not
touched.

### 1d. Restart webapp, then verify the DEPLOYED build (not checkout HEAD)

```bash
set -euo pipefail
sudo systemctl restart endlesstales-webapp.service
sleep 15
[ "$(systemctl is-active endlesstales-webapp.service)" = "active" ]  # abort otherwise: restart failed, do not verify further
```

Health checks verify `endlesstales-webapp.service` — the unit that serves
traffic. (A prior revision of this doc checked the runnext unit here; that
was wrong: runnext is the job runner and MUST stay stopped during
activation. Checking it proves nothing about the serving build.)

Printing checkout HEAD alone is NOT serving-build verification: it proves
only which commit is checked out, not which build the restarted service
is serving. The check below ties the successful build AND the restarted
service explicitly to the approved commit — all five signals required.

```bash
set -euo pipefail
cd /home/ubuntu/drivetimetales
NEW_BUILD_ID=$(cat .next/BUILD_ID); echo "serving build id: $NEW_BUILD_ID (must differ from $PREV_BUILD_ID when the tip moved, 1a)"
[ "$NEW_BUILD_ID" != "$PREV_BUILD_ID" ] || [ "$ACTIVATION_TIP" = "$PREV_COMMIT" ]  # abort: new tip but stale build identity
RUNTIME_COMMIT=$(git rev-parse HEAD); echo "runtime commit: $RUNTIME_COMMIT (must equal $ACTIVATION_TIP from 1b)"
[ "$RUNTIME_COMMIT" = "$ACTIVATION_TIP" ]  # abort on any mismatch: the service is not on the approved commit
curl -s -o /dev/null -w "stories API: %{http_code}\n" https://app.endless-tales.com/api/stories  # must print: 200
journalctl -u endlesstales-webapp.service --since "10 minutes ago" --no-pager | tail -n 30  # webapp.log clean: no exceptions, no boot loops
# success: webapp active + serving build id rotated + runtime commit == activation tip + stories API 200 + log clean
#   → optionally: rm -rf .next.bak.$SHORT (keep 24h first)
# any failure: restore .next backup (1c), restart webapp, re-verify against the PREV_* restore point (1a), ABORT activation
```

Only after all five signals are green (active unit, rotated build id,
runtime commit == activation tip, 200, clean log) is the host eligible
for step 2. runnext stays STOPPED throughout (see 1e).

### 1e. endlesstales-runnext.service stays STOPPED; paused crontab preserved

```bash
set -euo pipefail
[ "$(systemctl is-active endlesstales-runnext.service)" = "inactive" ]  # abort otherwise: workers live during activation, stop and report
```

Do NOT start runnext during activation — it stays STOPPED through every
step 1a–1d above (each step assumes no job runner is consuming the queue
while the build is swapped). Do NOT restore any cron backup file:
restoring a backup would re-install the pre-pause schedule and un-pause
scheduled dispatch behind the operator's back. The paused crontab
recorded in 1a is the desired steady state — if a single entry must
change, edit that line only with `crontab -e` and re-verify paused state
afterwards.

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
exactly as recorded in the 1a restore point; edit single lines only with
`crontab -e` and re-verify paused state afterwards.

## 4. DB/asset writes are recovered by row re-read, never deleted to undo

If a recovery write must be backed out: re-read the affected row(s),
write a forward correction (new fenced update), verify read-after-write.
Never DELETE rows or NULL columns to "undo" — deletion destroys the audit
trail the next recovery depends on.
