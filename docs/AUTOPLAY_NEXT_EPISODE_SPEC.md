# AUTOPLAY NEXT EPISODE — BEHAVIORAL SPEC
**Version 1.0 · June 10, 2026 · Endless Tales**
**Status:** Approved by Marc. LAUNCH GATE — public launch does not happen without this feature live.
**Implementer:** Codex (via Orion). This document defines BEHAVIOR. Codex reads the actual player code and database schema from the repo and maps this behavior onto them — where this spec names data concepts (series id, episode number, published flag), Codex uses the real columns, never invented ones.
**Decisions locked:** full intro sequence plays on the advanced-to episode (sting + Belle B — never skipped) · 5-second countdown · cancel returns to normal end-of-story behavior.

---

## 1. PURPOSE

A series cliffhanger creates tension; this feature converts it. When a series episode ends, the next episode begins automatically after a short, cancellable countdown — zero taps, which matters doubly for drivers who shouldn't touch the phone. This is the single highest-leverage binge mechanic in the retention research, and it is the converter for the Series Release Rule (Episode 2 is always live when Episode 1 is).

---

## 2. TRIGGER CONDITIONS — ALL must be true

1. The finished story is a **series episode** and **not the finale** (standalones and finales NEVER trigger autoplay).
2. The audio element fired its natural **`ended`** event — the full final mix played to completion, including the Belle B outro. Pausing, scrubbing, or abandoning mid-story never triggers it. (A listener who scrubs to the end and lets it finish still counts as ended — do not try to distinguish.)
3. A **next episode exists and is published/visible**: same series, episode number = current + 1, not hidden. Under the Series Release Rule this should always be true for non-finales; if the lookup finds nothing, fail silent — behave exactly like a standalone ending (Section 6).
4. The lookup result is cached/prefetched **before** the story ends (fetch it when the player loads or when playback passes ~90%), so the countdown never waits on a network call.

---

## 3. THE COUNTDOWN OVERLAY

On trigger, the player shows a full-width overlay:

- **Text:** `Next episode in 5…` counting 5 → 4 → 3 → 2 → 1. Below it, the next episode's title.
- **Cancel:** one very large button — minimum 25% of viewport height tap target, labeled **Cancel** — nothing clever, nothing small.
- **Design (per ET design rules):** dark background, WHITE text only (never gray on dark), orange-400/500 accent for the countdown ring/number, inline styles for all layout-critical CSS (position/width/height/flex). Text sized to be readable at a glance from a phone in a car mount — countdown number and title should be the largest text the player ever shows.
- No other controls compete with Cancel during the countdown.

**Countdown reaches 0 →** navigate to the next episode's player and begin playback immediately. The **full intro sequence plays**: ET sting, Belle B intro (with name stitch once that system is live), then the story. Belle B's Episode-2+ intros are written to ride the cliffhanger's momentum — she is never skipped.

**Background / screen-locked playback:** drivers finish episodes with the phone locked. If the app cannot show the overlay (page hidden / backgrounded), auto-advance anyway after the same 5-second silent gap. Cancel-while-locked is simply the lock-screen pause control. Update the media session metadata (title/series/artwork) on advance so the lock screen reflects the new episode.

---

## 4. CANCEL BEHAVIOR

Tapping Cancel (or navigating away during the countdown) aborts the advance and runs the **normal end-of-story behavior** — per existing player rules, navigate to /library. Cancel is per-instance only; it sets no persistent preference. (A user-level autoplay on/off setting is a possible future addition — explicitly out of scope for v1.)

---

## 5. DATA WRITES ON COMPLETION

When the `ended` event fires (before or in parallel with the countdown):
1. Mark the finished story **completed** in `user_library` for this user (existing completion semantics — completed = true; progress handled however the player already handles completion).
2. On advance, create/update the next episode's `user_library` row exactly as a manual play would — autoplay must be indistinguishable from a manual play in the data, with one exception:
3. **Analytics:** log distinct events to the existing analytics events mechanism: `autoplay_offered`, `autoplay_advanced`, `autoplay_cancelled` (with story id, series id, episode number). This is the seed data for the committed drop-off/retention analytics build — cheap now, valuable later.

---

## 6. NON-TRIGGER CASES — explicit

| Case | Behavior |
|---|---|
| Standalone ends | Normal end-of-story behavior. No overlay, ever. |
| Series FINALE ends | Normal end-of-story behavior. Belle B's formal series close is the last word — no overlay. |
| Non-finale but next episode missing/hidden | Silent fallback to normal end-of-story behavior. Additionally log a console/analytics warning — this is a Series Release Rule violation worth surfacing. |
| User pauses or scrubs mid-story | Nothing. Only the `ended` event matters. |
| User cancels countdown | Normal end-of-story behavior (/library). |

---

## 7. IMPLEMENTATION CONSTRAINTS (ET standing rules — non-negotiable)

- Read the existing player code first; modify the canonical player file — no parallel player variants, no page.tsx.backup (Canonical Mode).
- One goal, one change, one test. This feature only — do not bundle other player fixes into the same commit.
- No Supabase schema changes are expected (existing tables suffice). If Codex believes one is needed, STOP and get Marc's explicit approval; localhost first, always.
- Inline styles for layout-critical CSS; Tailwind only for colors/hover/text.
- Test on localhost, then deploy; hard-refresh (Cmd+Shift+R) after every Vercel deploy before judging results.

---

## 8. ACCEPTANCE TESTS (all must pass before the task closes)

1. Series Ep 1 plays to natural end → overlay appears within 250ms, counts 5→0, Ep 2 starts with full sting + Belle B intro.
2. Cancel tapped at any count → no advance, player navigates to /library, replaying Ep 1 later re-offers autoplay normally.
3. Series finale plays to end → no overlay; formal close behavior.
4. Standalone plays to end → no overlay.
5. Phone locked / app backgrounded, episode ends → next episode begins after ~5s; lock-screen metadata shows the new episode.
6. Next episode hidden in admin → silent normal ending + logged warning.
7. user_library: Ep 1 marked completed; Ep 2 row created identical to a manual play.
8. Analytics rows present for offered/advanced/cancelled across the above tests.
9. Visual check by Marc on a real phone: countdown number and Cancel are unmissable at arm's length; all text white on dark; orange accent.
10. Mid-story pause, scrub, and exit produce no overlay and no completion write.

---

*AUTOPLAY_NEXT_EPISODE_SPEC.md — Endless Tales · v1.0 · June 2026*
*Routing: Orion → Codex, verbatim (per Work Order 001 Section 4, MAYA/CODEX tasks). Changes require Marc's approval and version increment.*
