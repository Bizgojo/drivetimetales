# Phone interruption recovery and series navigation

Prepared on a separate branch from main `407f118d01e4b2c4f1d4c867cc0e7f6a7b2f6439`. No Admin, production pipeline, spending, publication, database schema, or deployment changes.

## Behavior

- Native pause (including operating-system controls) immediately persists the live audio position locally and to the existing progress endpoint/client path. Background/pagehide saves read the media element rather than potentially stale render state.
- A checkpoint bound to story, media source and segment restores an unexpected zero reset on subsequent Play/metadata. It never starts playback merely because the app gains focus. Explicit seek/Start Over clears the checkpoint; natural end is unchanged.
- Same-identity authentication refresh does not reload the episode source. A different story, user, resume selection or subscription profile can still load/revalidate normally.
- Series players show Previous, Episodes and Next. The episode dialog lists published, nonhidden episodes in order, current selection, completion and saved position. Selecting an unfinished episode uses the existing resume path. Start Over remains explicit. Existing automatic continuation is preserved.
- Episode progress uses existing per-user `user_library` records plus local progress. If that query fails, missing progress is labeled unavailable. No new RLS or access rules are introduced.

The reported call was not reproduced on hardware here. Source review identified native-pause persistence and auth-refresh reload gaps; the fix addresses those paths without claiming they are the only possible iOS interruption cause.

## Validation

- Changed player component/helper TypeScript program and its dependencies: zero diagnostics.
- Five targeted Jest suites: **41 passed** (interruption checkpoint, touch controls, seek, ended recovery, quit/navigation).
- Existing progress resume tests: **5 passed**.
- Broader seven-suite run: 49 passed, three failed. The same three failures reproduce against unchanged main in the old end-state/stall source-pattern tests. They expect markup/event handler source forms replaced before this change. They are not silently removed or reported passing.
- Fixture browser integration runs the actual CanonicalPlayer, real React event handlers and MediaSession action handlers. Both final-mix and segmented modes pass: native pause saves, zero-reset phone-screen Play restores, same-user auth refresh avoids reload, stored progress resumes after document reload, explicit Start Over starts at zero, episode list and previous/next navigation work.
- Browser viewport checks at 390×844, 820×1180, and 1440×1000: no horizontal overflow; episode controls reachable and at least 44px high. Dialog visually inspected. These are Chromium viewport checks, not Safari/device certification.
- No live user records or provider APIs were used in browser testing. Network is intercepted with fixtures. A full unrelated server build is not claimed for this patch.

Reproduce:

```bash
npx jest --config jest.config.js --runInBand __tests__/player-interruption.test.ts __tests__/player-touch-controls.test.ts __tests__/orion-player-seek-001.test.ts __tests__/orion-player-ended-001.test.ts __tests__/orion-player-quit-nav-001.test.ts
node --experimental-strip-types --test tests/player-progress-resume.test.mjs
node tests/player/interruption-browser.cjs
PLAYER_QA_SEGMENTED=1 node tests/player/interruption-browser.cjs
```

Browser checks require Playwright Chromium. `PLAYER_QA_CHROMIUM` accepts an alternate executable; `PLAYER_QA_SPARTICUZ` optionally supplies the installed Sparticuz package path for constrained test environments. No browser package was added to production dependencies.

## Acceptance and deployment

Orion is the sole authorized EC2 deployer. Do not deploy the development branch. Review and merge to main only with authorization, then use the established isolated build, health checks and retained rollback. Do not restart production workers.

Before production acceptance, use an authenticated iPhone session: listen several minutes, answer a real incoming call, return using lock-screen Play and verify the exact episode/position; repeat with a manual pause, background/lock, and Home Screen app. Test both final mixes and segmented audio. Verify a deliberate rewind and Start Over survive reload, previous/next and the episode list resume saved positions, first/last episode buttons disable correctly, and automatic continuation still advances normally. Confirm persistence across another device with the same account. Roll back the web release if those checks fail.
