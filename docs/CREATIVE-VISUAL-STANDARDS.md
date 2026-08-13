# Creative Visual Standards — Endless Tales

**Status:** Canon. See revision history at bottom.

---

## RULE: Cover Art and Ad Artwork Must Be Readable at Thumbnail Size

**Instituted:** Marc ruling, 2026-08-13  
**Applies to:** All cover art and ad creative (still images, video stills, story tiles)

---

### The Principle

**Mood is carried by palette and subject. Never by low exposure.**

A piece of artwork that is too dark to read at thumbnail size is a failed asset, regardless of how good it looks at full resolution. Darkness baked into an image is irreversible. Brightness can always be reduced later in CSS or ffmpeg. The inverse is not true.

---

### What This Rule Fixes

Four recurrences in one week (week of Aug 11, 2026):
1. Gate background required a brightness filter after generation
2. Ad creative required `brightness 1.55` after generation
3. Bell EP3–EP7 covers were too dark to read on a phone screen

Root cause in all cases: prompts stacked darkening instructions ("overcast, dusky," "deep shadow," "heavy shadow," "recedes into darkness," "the only light source"). The generator did what it was told. The problem was the prompts.

---

### Banned Prompt Language

Do not use any of the following in cover art or ad creative prompts:
- `dusky`
- `overcast` (as a lighting descriptor — it implies low exposure)
- `deep shadow`
- `heavy shadow`
- `recedes into darkness`
- `the only light source`
- `dim` (as a primary lighting descriptor)
- `low exposure`
- `dark` (as a lighting descriptor — acceptable as a color adjective, e.g. "dark wood")

---

### Required Prompt Language

Every cover art and ad creative prompt MUST include this phrase, verbatim:

> **"Well-lit, clearly visible subject, bright enough to read as a small thumbnail on a phone screen, even ambient lighting, no deep shadows obscuring the subject."**

---

### Mood Without Darkness

Mood is conveyed through:
- **Palette** — desaturated, muted, gray-green, rust-brown, Southern Gothic register
- **Subject** — emotionally resonant objects, characters, locations
- **Composition** — stillness, framing, depth
- **Texture** — aged paper, worn surfaces, weathered stone

NOT through:
- Low exposure
- Single-source dim lighting
- Shadows obscuring the subject

---

### Replace Specific Darkening Patterns

| Banned | Replacement |
|---|---|
| `lit by a single dim lamp` | `lit by soft, even ambient light` |
| `the only light source casts a cone` | `soft diffuse light from above fills the space evenly` |
| `the rest recedes into darkness` | `the full scene is visible, even in the distance` |
| `overcast sky` (as mood-setter) | `soft overcast light` with no further darkening |
| `heavy shadow on one side` | `subtle directional light, subject fully visible` |

---

### The 120×120 Test (Required Before Full Batch)

When generating a batch of covers:
1. Generate **the first image only**
2. Resize to **120×120 pixels** (the size of a library tile on a phone screen)
3. Check: is the main subject **clearly identifiable** at that size?
4. If NO: the image is too dark. Do not generate the remaining covers. Revise the prompt and regenerate the first image.
5. If YES: generate the remaining covers.

**Never skip this test and generate all five at once.** The test exists because one good result is recoverable. Five dark results mean five re-renders and five wasted API credits.

---

### The CSS/ffmpeg Rule

Any darkening that is needed for a specific use case (e.g., overlay for text legibility) must be applied in:
- CSS: `filter: brightness(0.8)` or a gradient overlay
- ffmpeg: `eq=brightness=-0.05`

This is reversible. Darkness baked into the source image is not.

---

### Applies To

- Story episode cover art (all series, all genres)
- Ad creative (Meta, Instagram, any platform)
- Gate page backgrounds
- Any generated image asset intended for end-user display

---

## Revision History

| Date | Author | Change |
|---|---|---|
| 2026-08-13 | Atlas (Marc ruling) | Initial standard — instituted after four darkness recurrences in one week |
