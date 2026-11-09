# CANON-11 — The Player
Status: DRAFT for Marc's approval · Nov 9, 2026 · Owner: Marc
Covers: everything that happens inside the player: playback, sting and Belle, pause and resume, saving progress, series buttons, auto-continue, the "Up next" gap, the review pop-up at story end, lock-screen and car controls, skip buttons, the offline player, the eBook reader inside the player, and play logging. Does not cover: the Library, story cards, Rate button look, playlists as a list, sign-up, trial and paywall (CANON-12 The Listener App); how stories, Belle intros/outros and name clips are written and voiced (story pipeline canon, docs/PIPELINE-CANON.md).

Note: docs/PLAYER-RULES.md is approved canon (Marc, Nov 9). Sections A to F copy it with the same meaning. Section G adds what it misses.

## Rules

### A. Playback basics — Agreed (docs/PLAYER-RULES.md)
The listener is always in control. The player never starts, restarts or jumps on its own, except auto-continue to the next episode, or to the next story in a playlist.
1. One player. There is one canonical player for every story. No copies or test variants in the live app. — **Agreed** (docs/PLAYER-RULES.md)
2. Every story and every episode opens with the Endless Tales sting, right at the start of Belle's intro. Then the story, then Belle's outro. This applies to a first play, Start Over and autoplay. Resuming after a pause continues from the same spot and does not replay the sting. Nothing is skipped. — **Agreed** (docs/PLAYER-RULES.md; Marc, Nov 8)
3. Pause works everywhere: in the app, on the lock screen, car controls and headphones. Pausing never resets the position. — **Agreed** (docs/PLAYER-RULES.md)
4. The lock screen shows the right episode: title, series and cover art, updated whenever the episode changes. — **Agreed** (docs/PLAYER-RULES.md)
5. Opening or returning to the app never starts playback by itself. Only the listener's Play does. — **Agreed** (docs/PLAYER-RULES.md)
6. Start Over happens only when the listener taps Start Over. — **Agreed** (docs/PLAYER-RULES.md)
7. When a standalone story or a series finale ends, the next story starts after 2 to 3 seconds if the listener is in a playlist. Otherwise the review screen pops up, then the Library. — **Agreed** (docs/PLAYER-RULES.md)
8. Personalized name in Belle's intro: if the listener's name can't be added, the no-name version plays. Playback is never blocked for this. — **Agreed** (docs/PLAYER-RULES.md)
9. Belle's outro points forward. In every episode except the last, Belle recaps the episode in one sentence, then promotes the next episode by its number. The last episode, and a standalone story, never points to another episode; it ends with the personalization statement. There is no gap between Belle's outro and the personalization. — **Agreed** (docs/PLAYER-RULES.md; Marc, Nov 8)
10. The progress bar is honest. It sits at the far left when an episode begins and reaches the far right exactly when it ends. It never stops partway when the episode is over, including after a pause and resume. — **Agreed** (docs/PLAYER-RULES.md; Marc, Nov 8)

### B. Saving and resuming — Agreed (docs/PLAYER-RULES.md)
A listener always comes back to the exact spot they left, on any device, after any interruption.
11. Progress saves every 5 seconds while playing, and right away on pause, seek, closing the app or locking the phone. — **Agreed** (docs/PLAYER-RULES.md)
12. Phone calls never lose the place. If a call or the phone resets the audio to zero, the player restores the saved spot when the listener presses Play. — **Agreed** (docs/PLAYER-RULES.md)
13. Rewinds count. If the listener goes back on purpose, the earlier spot is saved. An older save never overwrites a newer one. — **Agreed** (docs/PLAYER-RULES.md)
14. Finished means finished. An episode is marked complete only when it plays to the real end, never because it was closed near the end. Once complete, it stays complete. — **Agreed** (docs/PLAYER-RULES.md)
15. Same account, any device. Progress follows the listener to another phone or computer. — **Agreed** (docs/PLAYER-RULES.md)
16. Signing in again doesn't reload the episode. A login refresh for the same listener keeps playing where it is. — **Agreed** (docs/PLAYER-RULES.md)
17. Offline listening follows the same rules, including rewinds and saving when the app closes. — **Agreed** (docs/PLAYER-RULES.md)

### C. Series navigation — Agreed (docs/PLAYER-RULES.md)
18. Every series episode shows three buttons: Previous, Episodes and Next. — **Agreed** (docs/PLAYER-RULES.md)
19. Previous and Next go to the episode before or after. Previous is greyed out on Episode 1. Next is greyed out on the last episode. — **Agreed** (docs/PLAYER-RULES.md)
20. Episodes opens a list of the series' live episodes in order. It shows the current episode, which are finished, and the saved spot in each. — **Agreed** (docs/PLAYER-RULES.md)
21. Picking an unfinished episode resumes at its saved spot. Start Over stays a separate, deliberate choice. — **Agreed** (docs/PLAYER-RULES.md)
22. Only live episodes appear. Hidden episodes are never listed or reachable. — **Agreed** (docs/PLAYER-RULES.md)
23. If saved progress can't load, the list says "progress unavailable" instead of showing a wrong number. — **Agreed** (docs/PLAYER-RULES.md)
24. Series buttons are at least 44 pixels tall. — **Agreed** (docs/PLAYER-RULES.md)

### D. Auto-continue: next episode and next story — Agreed (docs/PLAYER-RULES.md)
Listening never stops between episodes. Each episode flows into the next until the story is finished. In a playlist, the next story starts after that. The gap is 2 to 3 seconds. (Marc, Nov 8)
25. Next episode: when a series episode plays to its natural end, the next episode starts by itself after 2 to 3 seconds. This repeats until the last episode is finished. — **Agreed** (docs/PLAYER-RULES.md; also memory /projects/.../areas/endless-tales-platform.md, Nov 5: "must always auto-advance… hard-wired")
26. Next story in a playlist: when a story is finished (its last episode, or a standalone), the next story in the playlist starts after 2 to 3 seconds. No review screen pops up in a playlist. Instead the finished story's card in the Library shows the red "Rate" button until the listener reviews it. — **Agreed** (docs/PLAYER-RULES.md; Marc, Nov 8)
27. Not in a playlist: when a story is finished, the review screen pops up by itself. If the listener closes it without reviewing, the center button on that story's card turns red ("Rate") until they review it. — **Agreed** (docs/PLAYER-RULES.md; Marc, Nov 8)
28. Every new episode or story starts with its sting and Belle's intro. — **Agreed** (docs/PLAYER-RULES.md)
29. Only a natural end counts. Pausing, scrubbing or leaving mid-story never triggers auto-continue. — **Agreed** (docs/PLAYER-RULES.md)
30. No "Still listening?" prompt. The player never stops to ask whether the listener is still there. It keeps going until the story, or the playlist, is finished. — **Agreed** (docs/PLAYER-RULES.md)
31. The next item must be live. If the next episode or story is missing or hidden, the player goes to the Library and logs a warning. — **Agreed** (docs/PLAYER-RULES.md)
32. Phone locked or app in the background: auto-continue works the same way, and the lock screen updates to the new episode or story. — **Agreed** (docs/PLAYER-RULES.md)
33. During the 2-to-3-second gap the screen shows "Up next" and the next title, in large white text on dark, with one large Cancel button. — **Agreed** (docs/PLAYER-RULES.md)
34. Tapping Cancel stops the advance and goes to the Library. It applies that one time only. — **Agreed** (docs/PLAYER-RULES.md)
35. Pressing pause during the gap (lock screen, car or headphones) just pauses. Pressing Play then starts the next item from the beginning, with the sting and Belle's intro. — **Agreed** (docs/PLAYER-RULES.md; memory player-rules.md)
36. The finished episode is marked complete, and the next one is recorded as if the listener pressed Play. Advanced and cancelled events are logged. — **Agreed** (docs/PLAYER-RULES.md)

### E. What listeners can see — Agreed (docs/PLAYER-RULES.md)
37. All episodes publish together. A series stays hidden until every episode is finished and approved, then they all go live at the same time. — **Agreed** (docs/PLAYER-RULES.md; Marc, Nov 8)
38. Episodes are numbered from 1 and count up with no gaps. — **Agreed** (docs/PLAYER-RULES.md)
39. Hidden episodes never show up in lists, navigation or autoplay. — **Agreed** (docs/PLAYER-RULES.md)
40. The publish switch on the Admin page decides who approves. It is checked when a story is ready to publish. On "Review", every story waits for Marc to listen and approve. On "Direct", stories go live without Marc's review. — **Agreed** (docs/PLAYER-RULES.md)
41. New episodes added to an existing series go live as one batch. — **Agreed** (docs/PLAYER-RULES.md)

### F. Design and readability — Agreed (docs/PLAYER-RULES.md)
42. White text on dark backgrounds. Never grey text on dark. — **Agreed** (docs/PLAYER-RULES.md)
43. Orange for emphasis, such as the "Up next" label. — **Agreed** (docs/PLAYER-RULES.md)
44. Buttons are at least 44 pixels tall. Cancel on the "Up next" screen is at least a quarter of the screen. — **Agreed** (docs/PLAYER-RULES.md)
45. Nothing spills sideways on phones, tablets or computers. — **Agreed** (docs/PLAYER-RULES.md)
46. Marc checks it on a real phone before any player change is accepted. — **Agreed** (docs/PLAYER-RULES.md)

### G. Added rules (not in docs/PLAYER-RULES.md)

Controls on the player screen
47. The Pause button is always visible on the player screen while a story plays, without scrolling. — **Agreed** (Marc's iPhone test Nov 6, chat "Cover story map pattern": "no pause button showing even when I scroll down"; fix handed off with Marc's go)
48. When playback is about to start by itself (auto-continue or a Play tap from a card), the big button already reads "Pause". It never flashes "Play" for a second. — **Agreed** (AUTOSTART-LABEL-001, Marc Nov 6, components/player/CanonicalPlayer.tsx)
49. There are two skip buttons: back 15 seconds and forward 15 seconds. — **In force (code)** (components/player/PlayerTransport.tsx)
50. The offline player uses the same skip amounts as the online player: back 15, forward 15. — **Proposed** (today offline is back 15 / forward 30; one rule avoids confusion)
51. At the natural end, the big button reads "Play Again" and starts from 0:00 with the sting. It never resumes from the last few seconds. — **In force (code)** (ORION-PLAYER-ENDSTATE-001, CanonicalPlayer.tsx)
52. The "Story complete" screen always has a "Browse more stories" button to Home. — **Agreed** (PLAYER-HOME-NAV-001, Marc Nov 6, CanonicalPlayer.tsx)
53. "Not for me" shows only before the listener has any progress and only on a standalone or Episode 1. Tapping it hides that story (all episodes of a series) and returns to the Library. — **In force (code)** (CanonicalPlayer.tsx handleNotForMe)
54. "Not for me" must meet the white-text and 44-pixel rules (today it is faint grey, 12px). — **Proposed** (fills a gap between rule 53 and rules 42 and 44)
55. The full player covers every page bar (Library genre bar, Continue card, playlist bar) but stays under the app header. — **Agreed** (PLAYER-ON-TOP-001, Marc Nov 6, components/player/PersistentPlayer.tsx)

Auto-continue details
56. Arriving by auto-continue plays the next episode from the top (0:00, with sting), even if the listener once listened to part of it. — **Agreed** (AUTOADVANCE-FRESH-001, Marc Nov 6, CanonicalPlayer.tsx)
57. On an advance, the old episode never replays, even for a second. — **Agreed** (HANDOFF-STALE-AUTOPLAY-001, Marc Oct 29, CanonicalPlayer.tsx)
58. Only Cancel during the gap, or the listener choosing a different story, stops auto-continue. Pause, phone calls, screen lock, background, car and headphone controls never turn it off. — **Agreed** (Marc's rule sent to the player builder, chat "Cover story map pattern", Nov 7; CanonicalPlayer.tsx comment "Marc's rule: interruptions never cancel series continuation"). See Conflict C2 about "Stop".
59. A playlist plays hands-free from first to last item, with no tap between stories, using the same audio element so phones allow it. — **Agreed** (MARC-PLAYLIST-HANDSFREE-001, Oct 7; MARC-PLAYLIST-AUTOADVANCE-001, Oct 5)
60. A new playlist item starts at 0:00. Coming back to the item the playlist was already on resumes at its saved spot. — **Agreed** (MARC-PLAYLIST-FRESH-001, Oct 7)
61. When an episode finishes in a playlist, it comes off the playlist and its offline copy is deleted. The rest of the playlist stays. — **Agreed** (QUEUE-OFFLINE-001, Marc Oct 4)
62. When the listener reaches the end of a playlist, the player shows "Playlist finished" and a large "Back to Library" button. — **Proposed** (today the card says "Catalog exhausted", which listeners won't understand)

Lock screen, car and headphones
63. Lock-screen and car controls offer Play, Pause, back 15 seconds, forward 15 seconds and drag-to-seek. — **In force (code)** (lib/mediaSession.ts, CAR-MEDIA-001)
64. "Next track" on the car or headphones goes to the next episode of a series. On a standalone it skips forward 15 seconds. — **In force (code)** (CanonicalPlayer.tsx mediaHandlers)
65. "Previous track" restarts the episode. Pressed in the first 5 seconds, it goes to the previous episode. — **In force (code)** (CanonicalPlayer.tsx mediaHandlers)
66. The player claims the lock screen only once the listener presses Play, so opening a page never takes over another app's audio. — **In force (code)** (CanonicalPlayer.tsx)

Speed, sleep timer, settings
67. The player has no speed control and no sleep timer today. Any setting shown to listeners must actually work; a control that does nothing is removed. — **Proposed** (Account → Settings shows Default Speed, Auto-Play Next, Skip Silence and Sleep Timer controls that save nothing and change nothing: app/account/settings/page.tsx)

Offline player
68. Downloaded paid stories play offline only while the offline license is valid: up to 14 days since the app last checked online, and never past the subscription end (plus 3 days grace, or 0 days if cancelled). Free stories always play. — **In force (code)** (lib/offline/license.ts, public/offline-player.html)
69. When the license runs out, the offline player says so in plain words and tells the listener to go online. It never fails silently. — **In force (code)** (public/offline-player.html)
70. The offline player follows the auto-continue gap (2 to 3 seconds) and the sting rule like the online player. — **Proposed** (today it starts the next download at once; rule 17 says offline follows the same rules)

eBook reader inside the player
71. There is one eBook reader, built into the player. "Read" on any card opens it, at the listener's saved page. Closing it returns to where the tap came from. — **Agreed** (Marc Oct 4 and Oct 7, UI-CARDS-EBOOK-NAV, CanonicalPlayer.tsx)
72. eBook text size is one per-listener setting (13 to 26 points) that carries to every story. — **Agreed** (MARC-EBOOK-FONTSIZE-001, Oct 7)
73. The reader shows a visible mark where the listener stopped reading. — **Agreed** (MARC-EBOOK-BOOKMARK-001, Oct 7)

Listener's name in Belle's intro (which clip plays)
74. Series: the personal name greeting plays on the first episode of the series this listener plays. Later episodes use the normal Belle intro. Standalone stories keep the name in the intro. — **Agreed** (Marc's change sent as PR #385, chat "Clearing CEO series flag", Nov 1–2; lib/personalization/firstPlayedOpener.ts). See Conflict C4.
75. If the name greeting is missing or fails, the normal intro plays with no gap and no error. — **Agreed** (docs/PLAYER-RULES.md rule 8; PR #385 chat)

Play logging and listen time
76. Every play is logged in play_events, including auto-continue starts, with how it started (tap, autoplay or auto-continue) and why it stopped (finished, paused, left, app closed, error, "Not for me"). — **In force (code)** (lib/analytics.ts, ORION-ANALYTICS-GAP-001)
77. Auto-continue writes three events: offered, advanced and cancelled, with story, series and episode number. — **Proposed** (needed to meet rule 36; the June spec named them autoplay_offered / autoplay_advanced / autoplay_cancelled; none exist in code)
78. Logging never blocks or slows playback. — **In force (code)** (lib/analytics.ts header)
79. Listening by test accounts is never counted in listener numbers. — **Proposed** (is_test_account exists for sales; same rule for listening)

## Conflicts found
- C1. docs/PLAYER-RULES.md (Nov 9) says a 2-to-3-second gap with a large "Up next" screen and a Cancel button. Code: a series advances at once with no gap and no Up next screen (CanonicalPlayer.tsx startAutoAdvanceTo skips its 2.5-second timer for "next episode"); playlists and the offline player also advance at once. The June spec said 5 seconds. Recommendation: PLAYER-RULES wins (newest, Marc-approved); fix code. Marc decides.
- C2. PLAYER-RULES: Cancel stops one advance only, then goes to the Library. Code: the Up next card has "Play now" and "Stop" (not "Cancel"); "Stop", and the lock-screen Stop action, turn auto-continue off for the rest of the session and stay on the player. Marc's Nov 7 rule allowed "an explicit STOP" to turn it off. Recommendation: one button named Cancel, one-time only, goes to Library; lock-screen Stop acts as Pause. Marc decides.
- C3. PLAYER-RULES: no review screen in a playlist. Code shows the review pop-up whenever a final episode finishes, in any mode (saveProgress → maybeShowCompletionReviewPrompt). Recommendation: PLAYER-RULES wins; skip the pop-up in playlist mode. Marc decides. (Not yet checked on a phone.)
- C4. Name greeting timing. Memory (/projects/.../areas/personalization.md and story-pipeline.md, Oct 29): "play whenever a listener starts Episode 1 from the beginning; on a later listen, warmly acknowledge the return." Nov 1–2 change (PR #385): "first episode this listener plays; replays get the normal intro." Also Oct 27–29: personalize the finale outro, but PR #385 found no personal outro exists. Recommendation: the newer Nov 1–2 rule (74) wins; the "returning listener" greeting and finale name outro stay open. Marc decides.
- C5. PLAYER-RULES: not in a playlist, the review screen pops up "then the Library". Code: after the listener closes review it goes to Library, but if they already reviewed, the player stays on a "Story complete" card. Recommendation: go to the Library in both cases, keeping "Browse more stories" (rule 52) only on the card shown while the review is open. Marc decides.
- C6. AUTOPLAY_NEXT_EPISODE_SPEC (June) said standalones and finales never auto-advance. PLAYER-RULES (Nov 9) auto-continues to the next playlist story. PLAYER-RULES wins (already noted as replaced).

## Open questions for Marc
- Q1. Autoplay on/off setting for listeners, or always on with Cancel? (Open in PLAYER-RULES.) Suggested answer: always on, with Cancel. Remove the dead "Auto-Play Next" toggle in Settings.
- Q2. Do listeners need a speed control (0.75x to 2x) or a sleep timer? Suggested answer: no speed control for now (drive-time); add a sleep timer later only if listeners ask, since it would stop playback by itself.
- Q3. What does "Stop" on the lock screen or car do? Suggested answer: the same as Pause.
- Q4. When the next playlist story is hidden or missing, should it skip to the one after, or go to the Library? PLAYER-RULES says Library. Suggested answer: skip to the next live story; go to the Library only when none is left.
- Q5. A paid listener's trial ends mid-episode while driving. Does audio stop? Suggested answer: never stop mid-episode; finish the episode, then show the wall at the next start (see CANON-12 paywall).
- Q6. Should the player show a sticky "Continue your story" mini-player on pages other than Home and Library? Today it shows only on those two. Suggested answer: keep as is.
- Q7. iPhone audio "ducks" (gets quieter) instead of pausing when another app uses the microphone, and does not come back up (chat "QR code marketing system", Nov 3). A web app can't detect this. Suggested answer: accept for the web app; fix in the native app.

## Enforcement status
- Rules 1–6, 11–24, 63–66: enforced in code (CanonicalPlayer.tsx, EpisodeNavigation.tsx, PlayerTransport.tsx, lib/mediaSession.ts, app/api/user/save-progress). Real iPhone and Android tests still not done (PLAYER-RULES open items).
- Rule 7, 25, 26, 33–35: NOT enforced. No 2-to-3-second gap and no Up next screen for series or playlists (see C1). Nov 8: episodes did not continue for Marc; cause not yet found.
- Rule 9: not enforced in audio yet (Nov 8 gap before personalization, After the Last Train EP3; pipeline outro rules not updated).
- Rule 10: not enforced (Nov 8: bar stopped at 59%, After the Last Train EP1, iPhone Safari).
- Rule 27 (red Rate on series): NOT enforced. components/LibraryStoryCard.tsx shows Rate only when "completed"; app/library/page.tsx getCardState never sets completed or reviewed for a series.
- Rule 30 ("Still listening?"): partly enforced. Nothing sets the prompt on any more, but its state, timer and screen are still in CanonicalPlayer.tsx (stillListeningPrompt, lines ~173, 188, 3134–3156). Remove the dead code.
- Rule 31: partial. The player shows "Series complete"/"Catalog exhausted" with a Back to Library button and a console error; no logged warning, no automatic move.
- Rule 34: not enforced (see C2).
- Rule 36, 77: partial. play_events marks auto_advance starts; offered/advanced/cancelled events do not exist.
- Rules 42–44: partly broken in the player: Up next card uses 11–13px grey text and ~38px buttons; time readout grey (#94a3b8, 12px); "Not for me" 45% white, 12px; Start Over 11px.
- Rule 47: enforced since the Nov 6 fix (PlayerTransport.tsx); re-check on phone.
- Rule 50, 70: not enforced (offline: +30 forward, no gap).
- Rule 67: not enforced. app/account/settings/page.tsx shows fake speed, autoplay, skip-silence, sleep-timer, download and notification controls.
- Rules 68–69, 71–73, 76, 78: enforced in code.

## Sources reviewed
- /tmp/dtt/docs/PLAYER-RULES.md (and identical copy /home/claude/player-rules.md)
- /tmp/dtt/docs/AUTOPLAY_NEXT_EPISODE_SPEC.md, docs/PLAYER-CALL-RESUME-EPISODES-20261030.md, docs/PLAYER-MOBILE-RESUME-AUDIT-20261031.md
- /tmp/dtt/components/player/CanonicalPlayer.tsx, PlayerTransport.tsx, EpisodeNavigation.tsx, PersistentPlayer.tsx
- /tmp/dtt/lib/mediaSession.ts, lib/analytics.ts, lib/offline/*.ts, public/offline-player.html, lib/personalization/firstPlayedOpener.ts
- /tmp/dtt/app/account/settings/page.tsx, components/LibraryStoryCard.tsx, app/library/page.tsx, AGENTS.md
- Memory: /projects/01a177ad-32bb-7644-9cd2-8794936d1a9f/areas/player-rules.md, .../endless-tales-platform.md, .../personalization.md, .../story-pipeline.md; /areas/personalization.md
- Chats: "Cover story map pattern" (Nov 6–8), "Clearing CEO series flag" (Nov 1–2), "QR code marketing system" (Nov 3)
- Not accessible: Claude project docs (no Projects tool in this session); repo git history is shallow (18 commits).

## Replaces (once approved)
- docs/PLAYER-RULES.md stays the master (this doc adds section G; fold G into PLAYER-RULES once approved).
- docs/AUTOPLAY_NEXT_EPISODE_SPEC.md, docs/PLAYER-CALL-RESUME-EPISODES-20261030.md, docs/PLAYER-MOBILE-RESUME-AUDIT-20261031.md (already marked replaced).
- "PLAYER_SPEC v1.0" (named locked in memory /areas/endless-tales-platform.md; file not found in repo).
- The old "Series Release Rule" (Episode 2 live with Episode 1).
