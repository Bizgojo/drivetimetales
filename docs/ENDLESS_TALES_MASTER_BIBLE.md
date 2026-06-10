# ENDLESS TALES — MASTER BIBLE
**Version 3.0 · June 10, 2026 · Marc Postlewaite**
**This is the one document to give Claude (or Hal) at the start of any Endless Tales session.**

It replaces MASTER-BIBLE.md (Feb 2026) and MASTER_RULES.md (Jan 2026) — both are ARCHIVED. They describe news briefings, credit pricing, and ADM tab workflows that no longer exist. If you are reading either of those documents, stop: they are wrong.

---

# 1. WHAT ENDLESS TALES IS

An audio-first cinematic story platform at app.endless-tales.com for people with free ears and active minds — commuters, long-haul truckers, people doing physical work. Subscription: $7.99/month, $59.99/year, 14-day free trial; founding beta members $2.99/month locked while continuously subscribed.

**The Series-First Rule:** ET is primarily a serialized audio storytelling platform. Series are the retention engine. Standalones exist for discovery, testing, variety, and onboarding — and every standalone should hand the listener to a series (see Bridge Lines, §5).

**The Primary Rule (North Star):** do not scale marketing or paid advertising until the production pipeline reliably produces high-quality stories end to end.

---

# 2. CURRENT STATUS (June 10, 2026)

**We are NOT launching July 7.** The launch date is unknown. Launch is gated on:
1. Three good smoke tests
2. Producing stories successfully under the new rules (Spec v1.4 / Stage 2 v2.2 / Validator v1.1)

Every work session begins with: TODAY'S GOAL — current gate, current blocker, what success looks like before stopping today. Every task must serve the current gate. No drift into unrelated feature work.

---

# 3. THE CANONICAL DOCUMENT SET

One rule lives in one document. If two documents disagree, the document listed as owning that rule wins, and the other document is a bug — fix it the same day.

| Document | Version | Owns |
|---|---|---|
| **PUBLISHED_STORY_SPEC.md** | v1.4 | What a finished story sounds like: listening experience, audio pipeline, mix specs, name stitch, anchor SFX, Resolution Map, release rules. **Wins all conflicts about the finished product.** |
| **STAGE2_SCRIPT_PROMPT.md** | v2.2 | How scripts get written: format, authors/narrators, Belle B writing rules, structure rules (hook, turns, sensory, endings, cliffhangers). Pasted alone into the script-writing chat. |
| **SCRIPT_VALIDATOR.md** | v1.1 | The pre-production quality gate. Pasted alone into the validation chat. Must always mechanically agree with Stage 2. |
| **STORY_BRIEF_TEMPLATE.md** | v2.1 | What Marc fills out per story. |
| **STORY_PRODUCTION_PROCESS.md** | v1.1 | The step-by-step workflow sheet. |
| **PERSONALIZATION_AND_SFX_IMPLEMENTATION.md** | v1.0 | Build spec: name-stitch tables/endpoints, SFX sourcing/mixing, pilot gates. |
| **MASTER_BIBLE.md** (this document) | v3.0 | Everything not owned above: grading, release policy, app gates, technical standing rules, roadmap, Hal rules. |
| Launch North Star | May 12, 2026 | Phase structure and gates — **except** the July 7 date and phase calendar dates, which are superseded by §2. |

**ARCHIVED (move out of the active bible folder):** MASTER-BIBLE.md, MASTER_RULES.md, Spec v1.0–v1.3 (incl. the May 20 v1.3 — merged into v1.4), Stage 2 v2.0–v2.1, Validator v1.0, Brief v2.0, all Canonical_Mode_Rules duplicates (keep one copy — its rules are restated in §8).

---

# 4. STORY QUALITY SYSTEM (decided June 10, 2026)

## The Grading Rubric — SIX dimensions, 1–5 each, 30 points total
1. **Hook** — did the first 90 seconds earn attention? Did I need to know what happens?
2. **Clarity** — could a distracted driver follow every character, place, and event without rewinding?
3. **Pacing** — did it turn every few minutes, or did the middle go flat?
4. **Audio Quality** — voices clean and balanced, music ducking properly, SFX landing in gaps, name stitch seamless, no ghost voices or cut-offs?
5. **Landing** — did the ending resolve and satisfy (or the cliffhanger burn)?
6. **Investment** — did I care what happened to this person? Did I feel something at the ending?

## Decision gates
| Score | Action |
|---|---|
| 26–30 | Publish. Record in Gold Standard log. |
| 22–25 | Publish. Log any dimension scoring 2 or below. |
| 17–21 | Fix first. Audio dimension failed → Mix Note Protocol. Any other → back to the writing chat, revise, re-validate. |
| Below 17 | Bring full scores + notes to Claude: "This story failed the grading rubric. Diagnose and advise." |

Same problem in 3+ stories → Pattern Log → bring to Claude to update the rules.

## The writing rules in force (owned by Stage 2 v2.2 — summary only)
- **Story Resolution Map:** mandatory six-section map (hook / why difficult / middle movement / final solution / why earned / variety guardrail) output as a comment block before any script is written
- 90-second hook: open with action, revelation, or conflict — never description, backstory, or weather; hook from CLARITY — WHO/WHERE/WHAT inside 60 seconds
- **Turn Rule:** a reveal/reversal/escalation every 3–4 minutes; no flat stretch over 5 minutes; midpoint reversal in 20+ minute stories
- **Sensory Anchor Rule:** two concrete sensory details in the first three narrator lines of every scene
- **Anchor SFX:** 3–6 bold discrete effects per story, in natural gaps, no ambience beds, never under dialogue
- **[MUSIC:OUT]/[MUSIC:IN]:** optional paired silence markers, max 2 per story, biggest moment only
- Hard cliffhangers on series non-finales; complete resolution on standalones and finales
- 130 wpm word-count standard; series episodes default 12–18 minutes
- American accents default; 10th-grade reading level; no parentheticals in dialogue

---

# 5. BELLE B (full rules owned by Spec v1.4 + Stage 2 v2.2)

- Voice ID **GMhgX8fCR9GUtd3kmlKC** — the improved Belle voice Marc selected May 2026; the only correct ID, anywhere, ever. Retired and never used: wewocdDkjSLm9ZwjO7TD, KWDD3Wyq30ZF5NEL01EJ. "Belle" is the spoken persona name; "BELLE B" the internal script label. Settings: stability 0.49, similarity 0.51, style 0.0, speaker boost true, speed 1.0, eleven_multilingual_v2. Mix volume 1.5x.
- Exclusively the announcer — never a narrator or character. Script label `BELLE B:` only.
- Warm friend, one listener, never a host. No time-of-day, no "welcome back," no "Endless Tales presents," no generic language, no rhetorical questions.
- **Intro:** ONE written line containing `[LISTENER_NAME]` once, at a natural pause, gracefully survivable without the name. Server-side stitch (belle_name_audio cache → partA+name+partB, silent no-name fallback). Name in the intro ONLY — never outros.
- **Outro:** one line, complete, specific to the story, credits author + "an Endless Tales original." Series non-finales tease one specific real thing from the next episode.
- **Bridge line (standalones only, conditional):** when a related series or recurring protagonist exists, ONE extra sentence after the formal close — a friend's aside ("Marsh has another case waiting whenever you are"). Never promo language, never on series episodes, never with the name.

---

# 6. RELEASE & APP POLICY (decided June 10, 2026)

1. **Series Release Rule — NON-NEGOTIABLE:** Episode 1 never publishes unless Episode 2 is produced, approved, and live in the same release. Three-episode series publish complete. Longer series may release weekly once Eps 1–2 are live. Never strand a listener on a cliff.
2. **Autoplay next episode — LAUNCH GATE:** public launch does not happen without it. After a series episode's Belle B outro: "Next episode in 5…" countdown with visible cancel, then autoplay. Built in parallel with smoke tests.
3. **Weekly release cadence** once live — consistency builds habit; irregular publishing is a measured churn driver.
4. **Drop-off analytics — COMMITTED, first analytics build once beta has listeners:** per-story admin histogram of last playback position for non-completers (user_library.progress already stores it). Findings feed the Pattern Log. Not built before beta listeners exist.
5. Marc approval required before any story publishes (Hal stages, §9).

---

# 7. PLATFORM & PIPELINE STANDING RULES

- **Stack:** Next.js 14 · Supabase (project vmyhlfeouzslixtkmddy) · Vercel · Stripe ($7.99/mo, $59.99/yr, 14-day trial) · ElevenLabs · Mercury. Source of truth: ~/Projects/drivetimetales/ (pages in app/, components in components/).
- **Audio pipeline:** generate-voices → render-final-mix, two-step ONLY. generate-story-complete is permanently banned. @ffmpeg-installer/ffmpeg (never ffmpeg-static). Sting crossfade: Belle B at 1200ms. Music ducks to 15% under dialogue. Voice normalization via dynaudnorm. 80+ segments = local mix. After every Vercel deploy: Cmd+Shift+R.
- **Voices:** all character voices from ElevenLabs My Voices via fetchMyVoices() — never hardcoded lists. Series voices locked from Episode 1. Recurring protagonists keep their voice across an author's standalones. Recently-used voices penalized; American +10 / British −5 when no accent specified. Platform narrators never cast as characters.
- **Supabase:** NEVER change production directly (no SQL edits, schema changes, view drops) without Marc's explicit approval; localhost first, always.
- **Code workflow:** get code from GitHub first; never create new code without explicit approval; written on the Mac via heredoc; commit immediately after changes; canonical mode (§8).
- **Design:** app = dark background, WHITE text only (never gray on dark). Admin = light background (#FAF9F6/#fff), dark text. Inline styles for position/width/height/flex. HSC play overlay: orange pill bottom-right ("Play"/"Continue"/"Play Again"); cover art keeps bottom-right corner clear.
- **No news briefings.** Removed permanently. Strip any reference found; never add news features.

---

# 8. CANONICAL MODE (applies to code AND documents)

One live version only. Superseded versions are archival only, never active, never in the working path. One file, one goal, one change, one test. If something is tangled, restore last-known-good and proceed cleanly — never layer patches on damage. Before testing: kill old dev servers, clear .next, one port. When a new version is accepted: old routes redirect, stale alternates leave the active path. **The June 10 contradiction audit happened because this rule wasn't applied to the bible itself. It is now.** Any document change: bump the version, changelog the change, update every dependent document in the same session, archive the old version.

---

# 9. HAL — AUTOMATION STAGES (from North Star, unchanged)

- **Stage 1 (current):** Hal generates and produces stories only when Marc explicitly starts the process.
- **Stage 2 (after 30–50 approved stories):** Hal may run batches unattended; every story still requires Marc review before publishing.
- **Stage 3 (after beta reliability proven):** Hal may recommend publishing and prepare release batches; Marc still approves.
- **Stage 4 (future only):** auto-publish of low-risk stories only after review gates, QA, listener feedback, and retention metrics are all proven.
- Standing restrictions: Hal does not push code to GitHub and does not create database tables.

---

# 10. ROADMAP — WHAT'S NEXT, IN ORDER

1. **Now:** commit the canonical document set; archive superseded docs. Three good smoke tests.
2. **Build alongside smoke tests:** name-stitch system (belle_name_audio, intro parts, stitch endpoint) and anchor SFX + music-marker support in render-final-mix — per PERSONALIZATION_AND_SFX_IMPLEMENTATION v1.0. Supabase migrations need Marc's approval, localhost first.
3. **Pilot:** two stories produced fully under v1.4 rules; Marc grades in the car on the 30-point rubric; both must pass 22+ with Audio ≥ 4. Pass → v1.4 is the production standard.
4. **Content buildout (Phase 2 of North Star):** series-first, honoring the Series Release Rule — 5–7 short series (3 eps, published complete), 2 flagship series (5–7 eps), 8–10 standalones with bridge lines, every major genre covered.
5. **Autoplay next episode** built before beta ends — it is a launch gate.
6. **Beta:** 25–50 founding members at $2.99; collect critiques; build drop-off analytics once listeners exist.
7. **Public launch** when beta listens are reliable and complaint-free. Then paid ad testing per North Star CAC targets ($20–40 initial, <$15 long-term); never scale ads without a repeatable winning campaign.

---

# 11. PENDING / OPEN ITEMS

- ~~STORY_BRIEF_TEMPLATE v2.1~~ DONE June 10 (PIPELINE_MODE field, anchor SFX candidates, MUSIC_SILENCE_MOMENTS, NEXT_LISTEN, 12–18 min default).
- ~~STORY_PRODUCTION_PROCESS v1.1~~ DONE June 10 (30-point rubric, gates 22/26, Resolution Map review step, Series Release Rule at publish).
- STORY_GRADING_RUBRIC.md — needs the Investment dimension written in (definition in §4).
- ~~Spec diff against repo~~ DONE June 10: repo v1.3 (May 20) merged into v1.4. Voice ID resolved: GMhgX8fCR9GUtd3kmlKC.
- Possibly still open from April (Marc to confirm): promo magic links, admin page ID mismatch, sting/intro crossfade polish.

---

*ENDLESS_TALES_MASTER_BIBLE.md · v3.0 · June 10, 2026*
*Changes require Marc's approval and a version increment. Commit to GitHub; archive superseded versions the same day.*
