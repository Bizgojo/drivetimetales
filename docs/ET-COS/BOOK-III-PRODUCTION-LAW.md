# ET-COS Book III — The Production Law
**Version:** 1.0 · Founding Edition
**Status:** DRAFT for Marc review
**Authority:** This Book owns how stories are made. Script format, voice rules, Belle B, audio spec, mix standards all live here. For conflicts about the finished product, defer to PUBLISHED_STORY_SPEC.md until that document is migrated into ET-COS v1.1.

---

## Chapter 1 — The Production Chain

Every Endless Tales story passes through these stages in order. No stage may be skipped.

```
Brief → Script → Preflight → Voice Generation → Mix → Package → Review → Publish
```

| Stage | Owner | Gate Condition |
|-------|-------|----------------|
| Brief | Marc / Author | Genome dimensions 1–18 set |
| Script | ASC / Manual | Passes SCRIPT_VALIDATOR rules |
| Preflight | ASC | All 9 preflight checks green |
| Voice Generation | ASC | No blocked segments; narrator + character voices assigned |
| Mix | ASC | final_mix.mp3 exists, nonzero duration |
| Package | ASC | cover, prose, series_id, duration_mins all set |
| Review | Marc | Story appears in Approval Console |
| Publish | Marc | Marc explicitly approves — is_hidden set to false |

**No stage may proceed if the prior stage has not passed its gate condition.**

---

## Chapter 2 — Script Format Law

### Required Headers (must appear at top of every script)

```
SERIES: [Series Name or "Standalone"]
EPISODE: [Episode Number]
EPISODE_TITLE: [Episode Title]
AUTHOR: [Author Pen Name]
NARRATOR: [Narrator Name]
GENRE: [Primary Genre]
DURATION: [Target minutes, integer]

---
```

All six headers are required. A script missing any header will fail preflight.

### Script Body Conventions

| Label | Usage |
|-------|-------|
| `BELLE B:` | The platform host. Intro and outro only. Never in story body. |
| `NARRATOR:` | The story narrator. All narration lines. |
| `[CHARACTER NAME]:` | Character dialogue. Must be uppercase. |
| `[SFX: description]` | Sound effect cue. In brackets. On its own line. |
| `[PAUSE:N]` | Explicit pause in seconds. Use sparingly. |
| `[BEAT]` | Short natural pause. |

### Belle B Structure

Every episode has exactly two Belle B sections:

```
BELLE B INTRO
---
BELLE B: [intro text]

[story body]

BELLE B OUTRO
---
BELLE B: [outro text]
```

**Belle B rules (non-negotiable):**
- Belle B voice: Canonical ID `GMhgX8fCR9GUtd3kmlKC` — no substitutes, no fallbacks
- EL settings: Stability 0.49 / Similarity 0.51 / Style 0.0 / Speaker Boost true / Speed 1.0
- Model: `eleven_multilingual_v2`
- Volume in final mix: 1.5x narrator level
- Script label: `BELLE B:` — never `ANNOUNCER:`, never `SANDY:`
- Belle B never speaks in the story body — only intro and outro

**Belle B intro formula:**
Title → Series/standalone → Tease (what's at stake without spoiling) → "Let's go."

**Belle B outro formula:**
Emotional echo of the episode's key moment → credits (title, author, narrator, Endless Tales original) → next episode tease if applicable

---

## Chapter 3 — Voice Assignment Law

### Narrator Resolution (Option B — current canonical)

Every story's narrator resolves through the author chain:

```
story.narrator_voice_id (if set) → use directly
  ↓ (if null)
story.author_id → authors.narrator_id → narrator_voices.elevenlabs_voice_id
  ↓ (if any link broken)
AUTHOR_NARRATOR_MISSING error (422) — production blocked
```

**There is no fallback narrator.** A missing narrator is a production error, not a default condition.

### Character Voice Codes

Characters are assigned voice codes before production. Format:

```
[ROLE]-[GENDER]-[AGE]-[TONE]-[ACCENT]-[VERSION]

Example: CH-MA-L5-DK-US-V1
  CH = Character
  MA = Male
  L5 = Late 50s
  DK = Dark tone
  US = American accent
  V1 = Version 1
```

Voice codes are idempotent: the same code always resolves to the same EL voice, via the `voice_code_registry` table. A code created once is reused everywhere.

**GENDER:** MA (male), FE (female), NE (neutral)
**AGE:** YO (young), M3 (mid-30s), E4 (early 40s), L5 (late 50s), L6 (late 60s), EL (elderly)
**TONE:** WM (warm), DK (dark), CR (crisp), NT (neutral), GR (gravelly), IT (intimate), WD (weathered), SD (sardonic), AU (authoritative)
**ACCENT:** US (American), UK (British)
**VERSION:** V1 (first version), V2 (second), etc.

### Voice Code Registry

Every character voice_code produces exactly one EL voice, persisted in `voice_code_registry` (Supabase). On first use, the voice is designed via EL Voice Design API and created as a permanent voice. On subsequent uses, the registry is checked first — no new EL credits consumed.

---

## Chapter 4 — Audio Mix Law

### Mix Assembly Order

```
1. Belle B intro (volume: 1.5x)
2. Music in at -40dB (under intro voice, not over it)
3. Music ramps to -18dB after last BELLE B intro line
4. Story segments (narrator + characters, normalized to -16 LUFS per line)
5. Dynamic ducking: music drops to -28dB under voice, returns to -18dB between lines
6. Belle B outro: music fades up to -12dB after final story line, fades to silence over 3-4 seconds
7. Sting: trimmed to exactly 2.0–2.5 seconds, ends before any voice, -1dBTP max
```

### Volume Standards

| Element | Target |
|---------|--------|
| Per-line voice (pre-mix) | -16 LUFS integrated, -1dBTP true-peak |
| Final mix | -14 LUFS integrated |
| Music during narration | -18dB from mix reference |
| Music during voice | -28dB (ducked) |
| Music under Belle B intro | -40dB (nearly inaudible) |
| Belle B volume | 1.5x narrator level |

### Sting Rules

- Every sting trimmed to 2.0–2.5 seconds before mixing
- Hard fade-out starting at 2.0s if source file exceeds 3 seconds
- Sting ends cleanly before any voice — no overlap
- Character: Netflix-style snap, not a jingle

---

## Chapter 5 — The Runtime Gate

**Standard stories:** 15–22 minutes final mix duration.

- Below 15 minutes: story is incomplete. Do not move to Ready for Review.
- Above 22 minutes: acceptable if story warrants it. Flag for Marc review.
- Short-form (test/sample/trailer): exempt only if Marc designates format before production begins.

**Runtime is verified by ffprobe on `final_mix.mp3`, not by script length or DB field.**

---

## Chapter 6 — The Audio Gate (Mandatory Before RFR)

Before any story moves to Ready for Review, all four conditions must be confirmed:

1. `final_mix.mp3` exists in Supabase storage for that story's ID
2. `final_mix.mp3` returns HTTP 200 with `content-type: audio/mpeg`
3. `final_mix.mp3` has nonzero duration (verified via ffprobe)
4. The Approval Console audio player can load and play the file

A story that fails any condition stays in production or repair. It never moves forward.

---

## Chapter 7 — What Production May Not Do

- May not push to GitHub without Marc's explicit approval
- May not set `is_hidden = false` without Marc's approval
- May not use Belle B voice ID `GMhgX8fCR9GUtd3kmlKC` as a character voice
- May not modify the Supabase schema (tables, columns, RLS) without Marc's approval
- May not change Vercel environment variables
- May not use a fallback narrator when the narrator chain is broken
- May not move a story to Ready for Review if the Runtime Gate or Audio Gate has not passed
