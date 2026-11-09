> **REPLACED BY CANON-11 (approved by Marc, Nov 9, 2026).** docs/canon/CANON-11-player.md holds these same rules and is now the rule. This file is kept for history. Rule changes go through CANON-99 only.

# Endless Tales — Player Rules (CANON)

> **CANON — single source of truth for player behavior.** Read this before any change to the player, autoplay, progress saving, series navigation, review prompts or publishing visibility. If code or any other document disagrees with this file, this file wins and the code is fixed to match.
>
> Owner: Marc. Master copy: the "Endless Tales — Player Rules" Claude Doc (https://claude.ai/artifact/FAEPuznLyWWozCNsZxut6H). When Marc changes the doc, this file is updated to match in the same day. Agents never edit the rules themselves; they propose changes to Marc.

Final version: November 9, 2026.

## Purpose

This is the one source of truth for how the Endless Tales player behaves. If anything here disagrees with an older document or the code, this document wins, and the code gets fixed to match. Final version: November 9, 2026.

- **Who changes it:** only Marc. Edit any line directly; agents propose changes as comments.
- **Who follows it:** Claude, Orion, Codex and every agent building or testing the player.
- **Listener in mind:** someone driving, phone in a car mount, who should never need to look or tap.

## Playback basics

The listener is always in control: the player never starts, restarts or jumps on its own, except auto-continue to the next episode, or to the next story in a playlist (see Auto-continue).

1. **One player.** There is one canonical player for every story. No copies or test variants in the live app.
2. **Every story starts with the sting:** every story and every episode opens with the Endless Tales sting, right at the start of Belle's intro. Then the story, then Belle's outro. This applies to a first play, Start Over and autoplay. Resuming after a pause continues from the same spot and does not replay the sting. Nothing is skipped. (Marc, Nov 8, 2026)
3. **Pause works everywhere** — in the app, on the lock screen, car controls and headphones — and pausing never resets the position.
4. **The lock screen shows the right episode:** title, series and cover art, updated whenever the episode changes.
5. **Opening or returning to the app never starts playback by itself.** Only the listener's Play does.
6. **Start Over happens only when the listener taps Start Over.**
7. **When a standalone story or a series finale ends,** the next story starts after 2 to 3 seconds if the listener is in a playlist; otherwise the review screen pops up, then the Library.
8. **Personalized name in Belle's intro:** if the listener's name can't be added, the no-name version plays. Playback is never blocked for this.
9. **Belle's outro points forward.** In every episode except the last, Belle recaps the episode in one sentence, then promotes the next episode by its number. The last episode, and a standalone story, never points to another episode; it ends with the personalization statement as it does now. There is no gap between Belle's outro and the personalization. (Marc, Nov 8, 2026. Full writing rule: belle-outro-forward-rule in the project docs.)
10. **The progress bar is honest.** It sits at the far left when an episode begins and reaches the far right exactly when it ends. It never stops partway across when the episode is over, including after a pause and resume. (Marc, Nov 8, 2026)

## Saving and resuming

A listener always comes back to the exact spot they left, on any device, after any interruption.

1. **Progress saves every 5 seconds** while playing, and immediately on pause, seek, closing the app or locking the phone.
2. **Phone calls never lose the place.** If a call or the phone resets the audio to zero, the player restores the saved spot when the listener presses Play.
3. **Rewinds count.** If the listener goes back on purpose, the earlier spot is saved. An older save never overwrites a newer one.
4. **Finished means finished.** An episode is marked complete only when it plays to the real end, never because it was closed near the end. Once complete, it stays complete.
5. **Same account, any device.** Progress follows the listener to another phone or computer.
6. **Signing in again doesn't reload the episode.** A login refresh for the same listener keeps playing where it is.
7. **Offline listening follows the same rules,** including rewinds and saving when the app closes.

## Series navigation

Every series episode shows three buttons: **Previous**, **Episodes** and **Next**.

1. **Previous and Next** go to the episode before or after. Previous is greyed out on Episode 1; Next is greyed out on the last episode.
2. **Episodes** opens a list of the series' live episodes in order. It shows the current episode, which are finished, and the saved spot in each.
3. **Picking an unfinished episode resumes at its saved spot.** Start Over stays a separate, deliberate choice.
4. **Only live episodes appear.** Hidden episodes are never listed or reachable.
5. **If saved progress can't load,** the list says "progress unavailable" instead of showing a wrong number.
6. **Buttons are at least 44 pixels tall,** big enough to hit without looking closely.

## Auto-continue: next episode and next story

Listening never stops between episodes. Each episode flows into the next until the story is finished, and in a playlist the next story starts after that. The gap is 2 to 3 seconds. (Marc, Nov 8, 2026)

1. **Next episode.** When a series episode plays to its natural end, the next episode starts automatically after 2 to 3 seconds. This repeats until the last episode is finished.
2. **Next story in a playlist.** When a story is finished (its last episode, or a standalone story), the next story in the playlist starts after 2 to 3 seconds. No review screen pops up in a playlist; instead the finished story's card in the Library automatically shows the red "Rate" button until the listener reviews it. (Marc, Nov 8, 2026)
3. **Not in a playlist: review, then Library.** When a story is finished (its last episode, or a standalone), the review screen pops up automatically. If the listener closes it without reviewing, the center button on that story's card in the Library turns red ("Rate") until they review it. (Marc, Nov 8, 2026)
4. **Every new episode or story starts with its sting and Belle's intro.**
5. **Only a natural end counts.** Pausing, scrubbing or leaving mid-story never triggers it.
6. **No "Still listening?" prompt.** The player never stops to ask whether the listener is still there. It keeps going until the story, or the playlist, is finished.
7. **The next item must be live.** If the next episode or story is missing or hidden, the player goes to the Library and logs a warning.
8. **Phone locked or app in the background:** it continues the same way, and the lock screen updates to the new episode or story.

**During the 2-to-3-second gap.**

- The screen shows "Up next" and the next title, in large white text on dark, with one large **Cancel** button.
- Tapping **Cancel** stops the advance and goes to the Library. It applies that one time only.
- Pressing pause (lock screen, car or headphones) just pauses. Pressing Play starts the next item from the beginning, with the sting and Belle's intro.

**What gets recorded.** The finished episode is marked complete, and the next one is recorded as if the listener pressed Play. Advanced and cancelled events are logged for later analysis.

## What listeners can see

A story goes live complete, with all of its episodes at once. Listeners never find a series with missing episodes.

1. **All episodes publish together.** A series stays hidden until every episode is finished and approved, then they all go live at the same time. (Marc, Nov 8, 2026)
2. **Episodes are numbered from 1** and count up with no gaps, so "next episode" is never ambiguous.
3. **Hidden episodes never show up** in lists, navigation or autoplay.
4. **The publish switch on the Admin page decides who approves.** The switch is checked at the moment a story is ready to publish. On "Review" (Ready for Review), every story waits for Marc to listen and approve before it goes live. On "Direct", stories go live without Marc's review.
5. **New episodes added to an existing series** go live as one batch, the same way.

## Design and readability

Everything in the player must be readable at arm's length from a phone in a car mount.

1. **White text on dark backgrounds.** Never grey text on dark.
2. **Orange for emphasis,** such as the "Up next" label.
3. **Buttons are big:** at least 44 pixels tall. Cancel on the "Up next" screen is at least a quarter of the screen.
4. **Nothing spills sideways** on phones, tablets or computers.
5. **Marc checks it on a real phone** before any player change is accepted.

## Open items

These rules are written down, but several have never been checked on a real phone. Tick each item when it's done.

- [ ] **Real iPhone test of phone calls and resume.** Listen a few minutes, take a real call, return with lock-screen Play, and confirm the same spot. Repeat with a manual pause, the phone locked, and the Home Screen app.
- [ ] **Real Android test** of the same steps.
- [ ] **Confirm autoplay is live** and matches the Auto-continue section on a real phone: a 2-to-3-second gap, next story in a playlist, and a locked-phone advance.
- [ ] **Marc's arm's-length check** of the "Up next" screen and Cancel button on a real phone.
- [ ] **Confirm progress carries to a second device** on the same account.
- [ ] **Decide: autoplay on/off setting** for listeners, or keep it always on with Cancel?
- [ ] **Retire the old "Series Release Rule"** (Episode 2 always live when Episode 1 is). It's replaced by "all episodes publish together."
- [ ] **Fix: episodes did not continue.** On Nov 8 Marc played a series and it stopped after each episode. Find why and fix it to match Auto-continue.
- [ ] **Confirm what a "playlist" is in the app** (a listener's saved list, a genre queue, or both) so auto-continue knows the next story.
- [ ] **Mark the old player documents as replaced** with a note at the top of each pointing to this document. The June autoplay spec's 5-second countdown is replaced by 2 to 3 seconds.
- [ ] **Fix: progress bar stopped in the middle.** On Nov 8 (After the Last Train, EP1, iPhone Safari) the episode ended after a pause and resume with the bar near the middle (59%).
- [ ] **Fix: remove the "Still listening?" prompt.** The player still has it; it contradicts Auto-continue.
- [ ] **Fix: red Rate button on series.** Today it works only on single-story cards. It must also work on a finished series' card.
- [ ] **Fix: gap before the personalization.** On Nov 8 (After the Last Train, EP3) there was a gap between Belle's outro and the personalization statement.
- [ ] **Update the pipeline's Belle outro rules** to match "Belle's outro points forward" (one-sentence recap, next episode by number).

## Source documents

This document replaces the older documents below as the source of truth. They stay in the code repository as history and test details.

|  Document | Date | What it covered |
| --- | --- | --- |
| [AUTOPLAY\_NEXT\_EPISODE\_SPEC.md](https://github.com/Bizgojo/drivetimetales/blob/main/docs/AUTOPLAY_NEXT_EPISODE_SPEC.md) | Jun 10, 2026 | Autoplay countdown, cancel, recording, 10 acceptance checks. Replaced: the 5-second countdown is now 2 to 3 seconds |
| [PLAYER-CALL-RESUME-EPISODES-20261030.md](https://github.com/Bizgojo/drivetimetales/blob/main/docs/PLAYER-CALL-RESUME-EPISODES-20261030.md) | Oct 30, 2026 | Phone calls, pause saving, Previous / Episodes / Next |
| [PLAYER-MOBILE-RESUME-AUDIT-20261031.md](https://github.com/Bizgojo/drivetimetales/blob/main/docs/PLAYER-MOBILE-RESUME-AUDIT-20261031.md) | Oct 31, 2026 | Save timing, rewinds, completion, offline player |
| [PIPELINE-CANON.md](https://github.com/Bizgojo/drivetimetales/blob/main/docs/PIPELINE-CANON.md) | ongoing | Episode numbering and release rules |
| [PUBLISHED\_STORY\_SPEC.md](https://github.com/Bizgojo/drivetimetales/blob/main/docs/PUBLISHED_STORY_SPEC.md) | ongoing | Name-in-intro fallback, never block playback |
