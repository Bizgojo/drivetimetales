# Mobile interruption and resume audit — 2026-10-31

## Release status

Development corrections only, based on main eac0ef892b9dc87710663174b3ddd78c3bd9e5dd. No merge or deployment. Orion remains the sole EC2 deployer. The serving EC2 commit was not verified. This report does not certify the live site or physical iPhone/Android behavior.

## Findings and corrections

- The close/background endpoint rejected rewinds and zero resets and could refresh the timestamp of an ignored, larger position. Timestamped saves now accept intentional lower positions, reject older observations, and use an atomic timestamp condition scoped to the authenticated user. Concurrent initial inserts are recovered. Legacy callers retain conservative behavior without refreshing ignored timestamps.
- Closing near the end could mark an unfinished story completed. Completion now requires an explicit completion observation and remains sticky.
- Continuous timeupdate events restarted a debounce indefinitely, starving periodic server saves. Progress now uses a five-second throttle reading the current position; pause, seek, restart, story change, and unmount cancel pending timers.
- Normal saves and recovery of newer local progress use the same authenticated ordered endpoint. Local progress is written first. No schema, RLS, or authentication changes.
- Media Session Stop saves and pauses without resetting. Repeated OS pause actions remain safe.
- Source retry/stall recovery preserves the last same-source checkpoint when an interruption resets the media element to zero.
- The offline player previously kept the maximum position, losing rewinds, and could save an interruption-induced zero. It now preserves segment checkpoints and pending seek offsets, accepts deliberate rewinds/zero, and saves on pagehide.

## Executed checks

| Check | Actual result | Boundary |
|---|---|---|
| Online interruption matrix | PASS: 56 scenarios (14 × 2 formats × 2 mobile profiles) | Chromium, mocked media element and API |
| Offline interruption matrix | PASS: 12 scenarios (6 × 2 mobile profiles) | Real offline HTML/IndexedDB, mocked media element |
| Targeted Jest suites | PASS: 55 tests in 6 suites | Includes 14 authenticated endpoint behavior tests with mocked database |
| Progress merge tests | PASS: 5 tests | Node test runner |
| Targeted TypeScript compilation | PASS: zero diagnostics | Player, progress endpoint, and their dependencies |
| Physical iPhone Safari / installed web app | NOT TESTED | No physical device available |
| Physical Android Chrome / installed web app | NOT TESTED | No physical device available |
| WebKit simulation | BLOCKED | Browser download repeatedly returned a truncated archive |
| Live testing-domain / EC2 deployment | NOT VERIFIED | No deployment performed |

On unchanged main, the new endpoint regression suite failed 11 assertions (3 passed); these are protocol/behavior assertions, not 11 distinct bugs. The offline baseline reproduced loss of position: expected 305 seconds, got zero. Both pass with the corrections.

Online scenarios per format/profile: full player pause/play; in-app mini-player callback pause/play; Media Session pause/play; Media Session stop/play; native pause followed by zero reset and recovery through OS, full UI, mini callback, or native play; background/foreground interruption; pagehide/return; repeated OS pause; paused rewind; explicit zero seek; and continuous playback producing a periodic save. Formats: final mix and intro/body/outro segments. Profiles: iPhone 13 and Pixel 7. The mini-player callback is emitted by the actual CanonicalPlayer; the full PersistentPlayer navigation host is not mounted in this fixture. Background/foreground alone must not force playback. Existing fixture checks also cover refresh recovery, start-over, same-user auth refresh, episode navigation controls, and responsive touch targets. Final-mix error retry after a reset is checked separately.

Offline scenarios per profile: pause/reset/resume in intro, body and outro; rewind from outro to intro; explicit zero; OS Stop followed by pagehide and reload.

All browser media and network behavior in these fixtures is controlled test input. No live customer database was written. Fixture console service-worker fetch errors are not device evidence; no uncaught player page errors were accepted.

## Physical-device acceptance still required

Run on an actual iPhone in Safari and installed mode, and an Android phone in Chrome and installed mode. Record OS/browser versions and the deployed commit. Use both final mixes and segmented episodes, checking audible content and saved seconds after every return/reload. A successful deployment is not a pass.

| Trigger | Required observations | Status |
|---|---|---|
| Full player, app mini player, lock-screen and notification Pause/Play/Stop | Same story and position; no duplicate audio | NOT TESTED on hardware |
| Incoming call accepted, declined, missed; outgoing call; repeated calls | Resume at checkpoint; foreground alone never forces playback | NOT TESTED |
| Siri/Assistant, alarm/timer, navigation speech, another audio app | Correct interruption and resume behavior under the OS policy | NOT TESTED |
| Wired/headphone removal, Bluetooth disconnect/reconnect, headset buttons, CarPlay/Android Auto | Saved position; no unexpected speaker playback | NOT TESTED |
| Lock/unlock, app switch, background 5 seconds/1 minute/30 minutes, battery saver | Same source/segment and position after resume | NOT TESTED |
| Browser tab close/reopen, swipe app away, process eviction, phone restart | Recover latest persisted checkpoint; document any final unsaved interval | NOT TESTED |
| Wi-Fi/cellular switch, offline/online, buffering, failed source and retry | Preserve checkpoint through reload/error | NOT TESTED on hardware |
| Rewind/forward 15 seconds, scrub, restart, segment boundary, natural end and automatic next | Deliberate seeks win; natural completion and next story remain correct | NOT TESTED on hardware |
| Log out/in, two-device account handoff, delayed saves, device clock skew | Correct account and newest intended checkpoint; record clock limits | NOT TESTED end to end |

Abrupt OS termination cannot guarantee a final event; recovery is limited to the most recent durable checkpoint. Timestamp ordering currently depends on client clocks, with future timestamps over one minute rejected. Real device clocks and network delivery require acceptance testing. Storage denial/quota exhaustion also prevents guaranteed local persistence and must be recorded as a separate failure mode.

## Reproduction commands

- `npx jest --config jest.config.js --runInBand __tests__/player-interruption.test.ts __tests__/player-touch-controls.test.ts __tests__/orion-player-seek-001.test.ts __tests__/orion-player-ended-001.test.ts __tests__/orion-player-quit-nav-001.test.ts __tests__/player-progress-endpoint.test.ts`
- `node --test tests/player-progress-resume.test.mjs`
- `PLAYER_QA_MATRIX=1 PLAYER_QA_PROFILE='iPhone 13' node tests/player/interruption-browser.cjs`; repeat with `PLAYER_QA_SEGMENTED=1` and with profile `Pixel 7`.
- `PLAYER_QA_PROFILE='iPhone 13' node tests/player/offline-interruption-browser.cjs`; repeat with profile `Pixel 7`.

Browser scripts accept `PLAYER_QA_CHROMIUM` and `PLAYER_QA_SPARTICUZ` for a separately installed Chromium runtime. No production dependency was added. Repository npm lock mismatch required local dependency installation with `--package-lock=false`; the lockfile was not changed.
