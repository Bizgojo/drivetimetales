# SERIES-RELEASE-RULE v2 — CANON

Drafted: 2026-07-11 by Orion, per Marc directive.
Signed off: 2026-07-11 by Marc (Telegram, 11:57 EDT), with one amendment (§3.3).
Replaces: SERIES-RELEASE-RULE v1 ("publish-complete" — no episode of a series
publishes until every episode is rendered and approved; previously enforced by
Orion from operating memory, never written as a standalone doc).

## 1. Purpose
v1 traded release velocity for a zero-risk guarantee that listeners never hit
a dead end mid-series. v2 keeps the listener guarantee (no starving an
in-progress series) while unlocking earlier release of long series, using a
rendered-episode buffer instead of full completion.

## 2. Definitions
- **Scripts-complete:** every episode of the series has a final script that has
  passed preflight (validator + excellence lessons), including the finale.
  Episode count is locked at this point — no adding/dropping episodes after.
  (Ratified judgment call: the lock lives here so the gate cannot be gamed by
  trimming a finale.)
- **Full voice-lock:** every voice used anywhere in the series (narrator +
  all character voices, all episodes) is assigned in the registry, verified
  available in ElevenLabs, and passes voice_preflight. No episode can later
  fail on a missing/mismatched/renamed voice.
- **Rendered:** episode has completed the production pipeline and sits in
  ready_for_review or beyond (Marc-approved states count).
- **Buffer:** count of rendered-but-not-yet-published episodes ahead of the
  newest published episode.

## 3. The Rule
1. **Publish gate (series > 3 episodes):** publishing of a series MAY begin
   when BOTH hold:
   a. Scripts-complete, AND
   b. Full voice-lock.
2. **Buffer requirement:** at first publish, buffer must be ≥ 3 rendered
   episodes. Publishing continues on schedule only while buffer ≥ 2.
3. **Release cadence (Marc amendment, 2026-07-11):** release cadence is
   declared per-series at first publish (default: 2 episodes/week) and can
   only be slowed, never accelerated past the buffer math.
4. **Auto-pause:** if buffer drops below 2, the release schedule pauses
   automatically — no next-episode publish until buffer is rebuilt to ≥ 3.
   (Ratified judgment call: resume threshold is ≥ 3, not ≥ 2, to prevent
   pause/resume flapping.) Pause events are logged and reported in the next
   brief (not an interrupt unless a published cliffhanger is left hanging
   > 72h).
5. **Short series (≤ 3 total episodes):** v1 behavior still applies —
   complete-publish. All episodes rendered and approved before any publishes.
6. **Marc's review authority unchanged:** every episode still passes through
   ready_for_review → Marc listens → Ready to Publish / Cold Storage. The
   buffer counts only episodes Marc could publish (rendered); an episode he
   sends to Cold Storage never counts toward buffer and triggers an immediate
   buffer recount.

## 4. Failure handling
- Any episode failing production while its series is mid-release counts
  against buffer immediately; auto-pause math uses live pipeline truth, not
  scheduled assumptions.
- If a mid-series episode is Cold-Storaged or requires rewrite after release
  has begun, release pauses regardless of buffer until series continuity is
  resolved (Orion escalates to Marc with options).

## 5. Enforcement & ownership
- Orion enforces the gate + buffer + cadence at publish time (publish tooling
  checks, not honor system).
- Atlas owns: buffer/auto-pause/cadence checks in the publish path, pause
  telemetry, and per-series cadence declaration storage. (Ticket:
  ATL-SERIES-RELEASE-V2.)
