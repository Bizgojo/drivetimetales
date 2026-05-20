# STORY GRADING RUBRIC — Endless Tales
**Version:** 1.1  
**Owner:** Marc Postlewaite / Endless Tales  
**Last Updated:** May 20, 2026
*Added: Story Resolution Map failure flags (v1.1)*

---

## PURPOSE

Marc listens to every mixed story before it publishes. This rubric converts that listening session into a scored decision — publish, fix the mix, or send the script back. It takes 5 minutes. It prevents substandard stories from reaching subscribers.

**The rule:** A story does not publish until it scores 18 or higher out of 25.

---

## HOW TO USE

1. Listen to the complete mixed story from beginning to end — no skipping
2. Score each of the five dimensions below from 1 to 5
3. Add the scores — total out of 25
4. Follow the decision table at the bottom
5. If fixing — use the Mix Note Protocol or send the script back to Claude with specific notes

Listen in the car or with headphones if possible. Your listeners are driving — you should be too, or at least simulating the conditions.

---

## THE FIVE DIMENSIONS

---

### DIMENSION 1 — HOOK (out of 5)
*Did the first 90 seconds earn your attention?*

| Score | What it sounds like |
|---|---|
| **5** | Grabbed immediately. Something was already happening. No desire to skip. |
| **4** | Engaged within 30–40 seconds. Minor slow start but recovered fast. |
| **3** | Took 60–90 seconds to get interested. A driver might have already changed it. |
| **2** | Still waiting for something to happen at the 90-second mark. |
| **1** | Would have skipped this within 20 seconds if you didn't know it was yours. |

**Score: _____ / 5**

**Notes (optional):**
```

```

---

### DIMENSION 2 — CLARITY (out of 5)
*Could you always tell who was speaking, where you were, and what was happening?*

This is the distracted driver test. Imagine you zoned out for 20 seconds. When you came back, could you reorient quickly? Were characters clearly differentiated? Did the narrator do its job of guiding you through the story?

| Score | What it sounds like |
|---|---|
| **5** | Always knew who was talking and where we were. Never lost. |
| **4** | One or two moments of minor confusion, resolved quickly. |
| **3** | Lost the thread 2–3 times. Had to work to catch up. |
| **2** | Characters felt hard to distinguish. Setting unclear in multiple scenes. |
| **1** | Genuinely confused about who was speaking or where we were for significant stretches. |

**Score: _____ / 5**

**Notes (optional):**
```

```

---

### DIMENSION 3 — PACING (out of 5)
*Did it hold your attention all the way through without dragging or feeling rushed?*

| Score | What it sounds like |
|---|---|
| **5** | Pulled you through without a single moment of wanting to skip ahead. |
| **4** | One slow patch but recovered. Overall momentum was strong. |
| **3** | Two or more slow patches. Caught yourself getting distracted. |
| **2** | Dragged noticeably in the middle. Story felt longer than it was. |
| **1** | Wanted to skip ahead or stop multiple times. Felt like a slog. |

**Score: _____ / 5**

**Notes (optional — note the approximate timestamp of any slow patches):**
```

```

---

### DIMENSION 4 — AUDIO QUALITY (out of 5)
*Did the mix serve the story — music, SFX, and voice levels all working together?*

This covers everything technical: music energy matching the scenes, SFX present and at the right level, voices clear and balanced, no jarring level jumps, silence used effectively.

| Score | What it sounds like |
|---|---|
| **5** | Mix felt invisible — it enhanced the story without calling attention to itself. |
| **4** | One minor audio issue but didn't break the experience. |
| **3** | One noticeable audio problem that pulled focus from the story. |
| **2** | Two or more audio problems. Mix felt like it was fighting the story. |
| **1** | Audio quality significantly damaged the experience. |

**Score: _____ / 5**

**If score is 3 or below — identify the problem(s) using the Mix Note Protocol category names:**
```
Problem 1: [category name] at timestamp ~[time]
Problem 2: [category name] at timestamp ~[time]
```

---

### DIMENSION 5 — LANDING (out of 5)
*Did the story end in a way that felt satisfying and complete — or for a series, did it make stopping feel impossible?*

**For standalone stories:** Did the ending resolve completely? Did you feel the story was finished — not paused, not abandoned? Did it leave you with something — an image, a feeling, a thought — that lingered for a moment after it ended?

**For series episodes (non-finale):** Did the cliffhanger make you want to immediately press play on the next episode? Did the outro tease something specific and real that you actually want to hear?

**For series finales:** Did it close everything? Did the series feel complete?

| Score | What it sounds like |
|---|---|
| **5** | Perfect landing. Standalone felt complete and resonant. Series made stopping feel wrong. |
| **4** | Good ending. One small thing felt unresolved or the tease was slightly generic. |
| **3** | Ending was adequate but not memorable. Standalone felt complete but flat. Series tease was vague. |
| **2** | Ending felt rushed or unearned. Standalone left a thread hanging. Series outro was generic. |
| **1** | Ending didn't work. Standalone felt unfinished. Series cliffhanger landed flat. |

**Score: _____ / 5**

**Notes (optional):**
```

```

---

## SCORING

**Total score: _____ / 25**

| Total Score | Decision | Action |
|---|---|---|
| **22–25** | ✅ **PUBLISH** | Approve immediately. Note what worked — these stories become gold standard references. |
| **18–21** | ✅ **PUBLISH** | Approve. Review your notes — if any single dimension scored 2 or below, log a mix note or script note even though it's publishing. |
| **14–17** | ⚠️ **FIX FIRST** | Do not publish. Identify whether the problem is audio (Mix Note Protocol) or script (send back to Claude). Fix and re-listen before publishing. |
| **10–13** | ❌ **SIGNIFICANT REWORK** | Do not publish. Bring the full rubric scores and notes to Claude. Claude will diagnose whether this is a script problem, a mix problem, or both. |
| **Below 10** | ❌ **RESTART** | Do not publish. This story has fundamental problems. Bring to Claude with the rubric scores — Claude will advise whether to rewrite the script, regenerate audio, or retire the story. |

---

## DECISION TREE

**If score is 18+:**
→ Publish. Go to Hal: set `is_hidden = false`.

**If score is 14–17:**
→ Which dimension scored lowest?
- Dimension 4 (Audio Quality) → Use Mix Note Protocol → Hal re-mixes → Re-listen
- Dimension 1, 2, 3, or 5 → Script problem → Bring rubric + notes to Claude → Claude advises revision → Hal re-records affected scenes if needed → Re-listen

**If score is below 14:**
→ Bring the full rubric scores and all dimension notes to Claude in a new chat.
→ Say: "This story failed the grading rubric. Here are the scores and notes. Diagnose and advise."
→ Claude will determine root cause and write a specific action plan.

---

## GOLD STANDARD TRACKING

When a story scores 22 or higher, record it here. These become the permanent quality benchmark — what Claude compares new stories against when there's a question about quality.

```
GOLD STANDARD STORIES
---------------------
Story title: 
Score: 
Date:
What worked (brief note):

Story title:
Score:
Date:
What worked (brief note):
```

---

## PATTERN LOG

When the same dimension scores 3 or below across two or more stories, it's a pattern — not a one-off. Log it here and bring it to Claude to update the rules.

```
PATTERN LOG
-----------
Dimension: 
Stories affected:
Common problem:
Date logged:
Rule update made: [yes/no — note which document was updated]
```

---

## STORY RESOLUTION MAP FAILURE FLAGS

These are hard failures evaluated BEFORE listening. The review bot checks for these automatically. A story with any of the following violations should not proceed to audio production until fixed.

**Flag immediately if:**

| Flag | What to look for |
|---|---|
| ❌ HOOK UNCLEAR | The main hook/problem is not stated or is too vague to pull a listener in |
| ❌ SOLUTION VAGUE | The final solution is undefined, ambiguous, or "life goes on" |
| ❌ PROMISE UNRESOLVED | The ending does not answer or transform the main hook/problem |
| ❌ STANDALONE INCOMPLETE | A standalone story leaves major problems unresolved at the end |
| ❌ FINALE INCOMPLETE | A final series episode leaves the series problem unresolved |
| ❌ FORMULAIC | Story repeats the same structure, reveal pattern, or ending style as prior stories |

**Also check:**
- Did Claude produce the Story Resolution Map comment block at the top of the script?
- Does the map have all six sections: Main Hook, Why Difficult, Middle Movement, Final Solution, Why Earned, Variety Guardrail?
- Is the Final Solution field concrete and specific — not vague?

If the Story Resolution Map is missing or incomplete, send the script back to Claude before scoring.

---

*STORY_GRADING_RUBRIC.md — Endless Tales · Version 1.1 · May 2026*  
*Changes require Marc's approval and version increment.*  
*Commit to GitHub at ~/Projects/ASC/ after any update.*
