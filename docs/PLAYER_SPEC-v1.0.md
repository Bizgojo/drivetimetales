# PLAYER_SPEC v1.0 — FINAL, READY FOR CANON LOCK
**Status:** All decisions resolved by Marc, July 8, 2026. Locks on Marc's repo commit (§6 Canon Rule).
**Date:** July 8, 2026
**Consolidates:** April 2026 player/resume rules, January 2026 playlist rules,
AUTOPLAY_NEXT_EPISODE_SPEC v1.0, READER_PROGRESS_SPEC v1.0, HSC overlay rules,
personalization playback rules. Where those documents conflict with this one,
THIS document wins after lock; the others become implementation references.

---

## 1. Purpose

The player is where the product's promise is kept. Every rule in this spec
serves one listener experience: press play in the car, hear a story with a
real ending, and have the app remember everything so the listener never has
to think about mechanics. The player is optimized for drive-time listening:
big targets, high contrast, glanceable state, zero required reading while moving.

---

## 2. Layout and Chrome

2.1 **One header.** The app layout owns the header. No page or component may
render a second header. The header shows the logged-in user's real identity
(auth session is the only identity source — no hardcoded defaults).

2.2 **Contrast rule (standing, restated):** dark background, WHITE text only.
Never gray-on-dark. Controls must be legible at arm's length.

2.3 **Cover display:** bottom-right corner of every cover remains clear
(HSC Play-pill rule applies on cards; in the player the cover displays full).

2.4 **Primary controls:** Play/Pause is the largest target on screen.
Skip back 15s and skip forward 15s flank it. All three operable without
precise aim — minimum touch target 56px.

2.5 **Progress bar:** shows elapsed, total, and remaining time. Draggable to scrub.

2.6 **Sleep timer.** 15/30/45 minutes or end-of-episode. On fire: 5-second
audio fade, pause, progress saved. Sleep timer overrides continuous mode
(no auto-advance after the timer pauses playback). Timer control lives in
the player overflow, one tap from the main screen, large targets.

---

## 3. Resume and Progress (unified rule — applies EVERYWHERE)

3.1 Progress saves automatically and continuously (per READER_PROGRESS_SPEC:
keepalive flush, server-side storage keyed to the user, merged with local).

3.2 **The 2-Minute Rule:** on any play of in-progress content:
- progress < 120 seconds → restart from the beginning
- progress >= 120 seconds → resume at (progress − 15 seconds)

3.3 The same rule applies in: direct play, series smart-continue, playlists,
and Continue Listening cards. One rule, no exceptions. The old 5-second
playlist variant is RETIRED (Marc ruling D1).

3.4 **Completion:** a story is "completed" at 95% played or on reaching the
outro's end, whichever first. Completed stories show "Play Again" (HSC rule).

3.5 **Smart-continue for series (existing logic, now canonical):**
priority = (a) episode in progress → (b) episode after the last completed →
(c) first unstarted → (d) episode 1.

---

## 4. End-of-Story Flow (the payoff moment)

The ending doctrine (canon, July 8) makes the last minute the product's most
valuable real estate. The player must honor it:

4.1 **No dead ends.** When audio ends, the player never simply stops on a
filled progress bar. Something always happens next.

4.2 **Series, mid-series episode ends:** auto-advance to the next episode
after a 2–3 second gap, with an "Up Next: [Episode title]" overlay during
the transition (AUTOPLAY spec, launch-gate feature — now canonical).
Auto-advance continues until series end or user pause.

4.3 **Series finale ends / standalone ends:** show the END CARD:
- "The End" acknowledgment beat (the listener finished something — say so)
- One-tap reaction: thumbs up / thumbs down on the story (feeds analytics + not_for_me)
- "Next story" recommendation card (same genre first, then adjacent group
  per GENRE-ATTRIBUTES adjacency), with Play button
- CONTINUOUS MODE IS ON BY DEFAULT (Marc ruling D2): the end card shows a
  10-second countdown ("Next story in 10s — tap to cancel") and the
  recommended story auto-plays unless cancelled. A visible toggle lets the
  listener turn continuous mode off; the setting persists per user.

4.4 **Driving safety:** the end card must be fully ignorable — if the listener
does nothing, behavior follows the continuous-mode setting; no required taps.

---

## 5. Playlists (rules updated for the subscription model)

5.1 Playlist playback uses the same resume rule (§3), the same auto-advance
gap and Up Next overlay (§4.2).

5.2 Audio announcements between items (Belle B):
"Next up: [Title], [Genre], by [Author]." Playlist end: "[Name], your
playlist has ended." — uses the personalization opener system where a
name clip exists; plain version otherwise.

5.3 Playlists are a subscriber feature. Guests/free-trial users see the
playlist UI but building one prompts subscription.

5.4 One active playlist at a time; it persists until finished or cleared.

5.5 **CREDITS ARE RETIRED (Marc ruling D3, confirmed):** Endless Tales no
longer uses credits anywhere. All January 2026 credit-based playlist rules
(10% deduction, skip refunds, credit-remaining locks) are VOID. Any remaining
credit references in player code are dead code — remove on sight.

---

## 6. Personalization and Audio Assembly (playback side)

6.1 Where a pre-built name-personalized opener clip exists for the user,
the player sequences it per the personalization system. Fallback to the
generic opener is silent and seamless — never an error state.

6.2 Segment playback uses the existing queue/advance system with preload
of the next segment. A failed segment SKIPS forward with a console warning —
playback never dies mid-story on one bad segment.

6.3 Outro music behavior follows PUBLISHED_STORY_SPEC (three-phase outro);
the player does not fade or cut audio early. The ending plays to completion.

---

## 7. Access Control

7.1 Free stories play for everyone. Paid stories: unauthenticated → /signin;
authenticated non-subscriber → /subscribe. (Existing paywall logic, canonical.)

7.2 Trial users are subscribers for playback purposes for the trial duration.

---

## 8. Resolved Decisions (Marc's rulings, July 8, 2026)

**D1 — Resume rollback: 15 seconds everywhere. RULED YES.** One rule (§3.2)
in every context; the 5-second playlist variant is retired.

**D2 — Continuous mode: AUTO-PLAY ON by default** with 10-second cancel
countdown on the end card and a persistent per-user toggle (§4.3).

**D3 — Credits retired. CONFIRMED.** (§5.5)

**D4 — Sleep timer: BUILD NOW.** (§2.6)

**D5 — Playback speed: LATER.** Not launch-critical; speed changes interact
poorly with the music mix. Revisit post-GVL with listener data.

---

## 9. Integration Points

- READER_PROGRESS_SPEC v1.0 — storage/sync mechanics for §3 (unchanged)
- AUTOPLAY_NEXT_EPISODE_SPEC v1.0 — implementation base for §4.2 (unchanged)
- GENRE-ATTRIBUTES-SPEC v1.0 — §4.3 recommendation adjacency
- PUBLISHED_STORY_SPEC v1.5 — §6.3 outro behavior
- PLAYER-UX-001 (in flight) — implements §2.1 (single header, identity source)

*End of spec. Locked by Marc Postlewaite, July 8, 2026.*
