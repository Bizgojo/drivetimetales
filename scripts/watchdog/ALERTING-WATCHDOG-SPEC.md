# ALERTING WATCHDOG — SPEC (Atlas build; alerting HALF only)

Status: SPEC (build pending). Companion to Marc's recovery watchdog
(`openclaw-watchdog.sh`, launchd, every 2 min — restarts dead gateway, clears
billing cooldowns, NO alerting). This half: DETECT + TELEGRAM ALERT, NO
recovery actions. The two must never fight (Marc rule, 2026-07-10).

## Design (locked 2026-07-10)
- launchd + plain node script (no AI models — must work when models are down).
- Direct Telegram Bot API send to Marc (independent of OpenClaw gateway).
- Checks: gateway process alive, gateway HTTP responsive, cron-failure log
  scan, external uptime ping of /api/stories (5-min cadence, failure-tested
  before launch).
- No restarts, no cooldown clears, no state mutation. Detect → alert → exit.

## Alert classes

### 1. RECOVERABLE (informational — recovery watchdog will act)
- Gateway process dead / port unresponsive → single alert with "recovery
  watchdog will restart within 2 min" note. Alert again only if still dead
  after 5 min (recovery failed).

### 2. 🔴 MARC-ACTION (added 2026-07-11 per Marc directive — NOT recoverable
by any automation; only Marc can fix. Alert IMMEDIATELY, once per 30-min
cooldown per signature, prefix "🔴 MARC ACTION")

**2a. Provider USAGE-LIMIT hits.** Tonight's live signature (2026-07-11
19:43–20:05 EDT, verbatim from cron failure spam):

```
FallbackSummaryError: All models failed (2):
anthropic/claude-haiku-4-5-20251001: {"type":"error","error":{"type":"invalid_request_error",
"message":"You have reached your specified API usage limits. You will regain access on
2026-08-01 at 00:00 UTC."}} (rate_limit)
anthropic/claude-sonnet-4-6: {"type":"error","error":{"type":"invalid_request_error",
"message":"You have reached your specified API usage limits. ..."}} (rate_limit)
```

Detection regexes (match ANY):
- `You have reached your specified API usage limits`
- `invalid_request_error.*usage limits`
- `FallbackSummaryError: All models failed`

Why MARC-ACTION: usage caps are an Anthropic Console billing setting — no
restart, cooldown-clear, or retry fixes them. CRITICAL INTERACTION: the
recovery watchdog clears billing cooldowns, which causes capped models to
retry in a loop (observed tonight: falls-park-rfr-watch fired failure spam
every ~5 min). The alerting half must fire its MARC-ACTION alert even while
recovery keeps "recovering," and must include the regain-access date parsed
from the error when present.

Alert template:
```
🔴 MARC ACTION — Anthropic usage limit hit
Models capped: <list>  Regain: <date from error>
Impact: <which cron/agent failed>
Automation cannot fix this (Console billing setting). Recovery watchdog
cooldown-clears will cause retry loops until models are avoided or limit raised.
```

**2b. (existing classes to fold in as encountered):** payment failure at
provider, key revocation/401s, Vercel account-level failures.

## Source-of-truth log locations to scan
- OpenClaw cron run failures (gateway logs / `openclaw tasks`)
- watchdog.log (recovery half's own actions — detect recovery loops: >3
  restarts or cooldown-clears in 30 min = escalate to MARC-ACTION 2a check)

---

## Gap-3 — Orion liveness watcher (Atlas; Marc decisions 2026-10-11 14:11 EDT)

Owner: Marc. Implementation: `scripts/watchdog/orion-liveness.sh` +
launchd plist `scripts/watchdog/com.endlesstales.orion-liveness.plist`.
Review: Lyra reviews before any merge. Branch: `feat/atlas-gap3-liveness-oct11`.

### Signal
- Heartbeat file: `~/.openclaw/workspace-orion/memory/heartbeat-state.json`
  (written by Orion heartbeats; contains `lastChecks` map of epoch timestamps).
- **Stale** = file mtime older than threshold AND newest `lastChecks` value
  older than threshold. Both must be stale (avoids false positives from a
  writer that touches the file without updating content, or vice versa).
- Missing file = no signal = treated as stale (alert only; watcher never
  creates or repairs the file).
- Unparseable `lastChecks` = newest-check age treated as infinite (mtime
  alone decides freshness only if mtime is fresh; both-stale rule still applies).
- Un-stat-able file = log error, NO alert, exit 0 (needs a human; do not spam).

### Threshold / cadence / alert (Marc decisions, authoritative)
- Threshold: **45 min** (`STALE_MINUTES`, env-overridable).
  Decision: gap3-threshold-oct11-1411.
- Cadence: **5 min** via launchd `StartInterval 300` (+ `RunAtLoad`).
  Decision: gap3-cadence-oct11-1411.
- Alert: critical Telegram via **direct Bot API** (`TELEGRAM_BOT_TOKEN` +
  `TELEGRAM_CHAT_ID` env; independent of the OpenClaw gateway — same
  mechanism as the alerting watchdog). Template prefix: `🔴 MARC ACTION —
  Orion silent`. Message carries age detail, threshold, cooldown, and the
  no-restart disclaimer.
- **Quiet-hours BYPASS: this check notifies immediately at any hour.**
  Orion-silence is critical (Marc decision gap3-quiet-oct11-1411). No other
  alert class gains quiet-hours bypass from this section.

### Cooldown
- **30-min re-alert cooldown while still dead** (`COOLDOWN_MINUTES`): first
  stale detection alerts (and stamps `orion-liveness.state` with the alert
  epoch); further runs suppress until 30 min elapse, then re-alert.
- Fresh signal deletes the state file (next death alerts immediately).
- Failed Telegram send does NOT stamp cooldown (retry next run).
- Missing credentials (env unset) logs `ALERT NOT SENT` and DOES stamp state
  (operator must provision creds; no crash, no spam beyond cooldown).

### Sentinel
- `MONITORING_PAUSED` file at
  `~/.openclaw/workspace-orion/memory/MONITORING_PAUSED`: when present, the
  watcher logs one skip line and exits silently — no alert, no state change.
  Same sentinel as the rest of monitoring; respected before all other logic.

### No-recovery rule
- Watcher **NEVER restarts Orion**, never clears cooldowns, never writes the
  DB, never mutates any state except its own `orion-liveness.state` +
  `orion-liveness.log` (Marc rule 2026-07-10). Detect → alert → exit.
- Plain bash + python3 + curl. **No AI dependency** (must work when models
  are down).
