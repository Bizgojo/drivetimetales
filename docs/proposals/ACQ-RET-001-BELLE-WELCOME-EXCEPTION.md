# Proposal: ACQ-RET-001-BELLE-WELCOME-EXCEPTION — Belle Welcome Exception for Promo Converts

**Proposal ID:** ACQ-RET-001-BELLE-WELCOME-EXCEPTION  
**Prepared by:** Hal (Endless Tales Creative Agent)  
**Date:** 2026-08-06  
**Target file:** `governance/ACQUISITION-RETENTION-001.md` — append as a named exception to A3b  
**Status:** PENDING MARC APPROVAL — do not commit governance file directly

---

## Background

Section A3b of ACQUISITION-RETENTION-001 describes the one-time Belle welcome for promo converts. It specifies that the first post-signup episode opens with Belle welcoming the listener to Endless Tales by name, then flows into the personalized intro and episode.

The current A3b language does not specify the exact structure or length of the welcome. In production, this has created ambiguity: the standard Belle line is a single short intro, but the promo-convert welcome requires more — a proper introduction to Belle herself, a statement of what series/episode is playing, and a callback to the specific cliffhanger the listener's promo arm ended on.

This proposal documents the exception and records the approved format.

---

## The Exception

**Standard Belle intro (member episodes — Gate B, all episodes except first post-signup):**  
One line. Names the listener (if known) and the episode. No introduction of Belle herself. No cliffhanger callback.

Example:
> BELLE B: "[LISTENER_NAME], Episode Two of The Bell Beneath Falls Park — The Seventh Token."

**Belle welcome exception (first post-signup episode for promo converts — A3b):**  
Longer. Four components, in order:

1. **Greeting with name** — addresses listener by [LISTENER_NAME]; if no name captured, drops gracefully (see "no name" handling below)
2. **Belle introduces herself** — "My name is Belle, and I'll be your Endless Tales host."
3. **Names the episode and series** — full episode title and series name
4. **Rephrases the cliffhanger callback** — brief in-character rephrase of the specific cliffhanger the listener's promo arm ended on; sets up the episode without being a recap

Format (approved per Marc verbal ruling 2026-08-06):
> BELLE B: "[LISTENER_NAME], welcome to Endless Tales. My name is Belle, and I'll be your Endless Tales host. You're listening to [EPISODE TITLE] of [SERIES NAME]. [ARM-SPECIFIC CLIFFHANGER CALLBACK] Let's continue."

**No-name handling:** When [LISTENER_NAME] is not captured (listener skipped name capture or name not passed to playback system), drop the name token and open directly with "Welcome to Endless Tales."

Example (no name):
> BELLE B: "Welcome to Endless Tales. My name is Belle, and I'll be your Endless Tales host. You're listening to Episode Two of The Bell Beneath Falls Park — The Seventh Token. [ARM-SPECIFIC CLIFFHANGER CALLBACK] Let's continue."

---

## Bell EP2 Examples — All Three B Variants

### OPENING-B1 (from PV1)
*PV1 ended on: "Mara... your mother had a flood token. Exactly like this one."*

> BELLE B: "[LISTENER_NAME], welcome to Endless Tales. My name is Belle, and I'll be your Endless Tales host. You're listening to Episode Two of The Bell Beneath Falls Park — The Seventh Token. You heard it: Mara's mother had a flood token — exactly like the one a dying man left in her hand. Let's continue."

*No name version:*
> BELLE B: "Welcome to Endless Tales. My name is Belle, and I'll be your Endless Tales host. You're listening to Episode Two of The Bell Beneath Falls Park — The Seventh Token. You heard it: Mara's mother had a flood token — exactly like the one a dying man left in her hand. Let's continue."

---

### OPENING-B2 (from PV2)
*PV2 ended on: "Do not trust the person who brings you the bell."*

> BELLE B: "[LISTENER_NAME], welcome to Endless Tales. My name is Belle, and I'll be your Endless Tales host. You're listening to Episode Two of The Bell Beneath Falls Park — The Seventh Token. The warning has been given: do not trust the person who brings you the bell. Now Mara has to figure out which one it is. Let's continue."

*No name version:*
> BELLE B: "Welcome to Endless Tales. My name is Belle, and I'll be your Endless Tales host. You're listening to Episode Two of The Bell Beneath Falls Park — The Seventh Token. The warning has been given: do not trust the person who brings you the bell. Now Mara has to figure out which one it is. Let's continue."

---

### OPENING-B3 (from PV3 B2)
*PV3 B2 ended on: "Bring Eli Mercer alone."*

> BELLE B: "[LISTENER_NAME], welcome to Endless Tales. My name is Belle, and I'll be your Endless Tales host. You're listening to Episode Two of The Bell Beneath Falls Park — The Seventh Token. Someone wanted Eli Mercer there — specifically, and alone. What Mara finds next explains why. Let's continue."

*No name version:*
> BELLE B: "Welcome to Endless Tales. My name is Belle, and I'll be your Endless Tales host. You're listening to Episode Two of The Bell Beneath Falls Park — The Seventh Token. Someone wanted Eli Mercer there — specifically, and alone. What Mara finds next explains why. Let's continue."

---

## What This Exception Does NOT Change

- Standard Belle intro (one line) applies to every member episode that is NOT the first post-signup episode.
- The A3b welcome plays **once only** — the first post-signup episode for that listener. EP3 onward uses the standard one-line Belle intro, even for listeners who entered via a promo arm.
- Voice ID for Belle B remains `GMhgX8fCR9GUtd3kmlKC` (announcer only, locked settings) for both the standard intro and the A3b welcome.
- The platform is responsible for selecting the correct B variant (B1/B2/B3) based on the arm the listener converted from.

---

## Marc Action Required

Marc reviews this proposal and commits the welcome-exception rule as an addition to A3b in `governance/ACQUISITION-RETENTION-001.md`. No agent commits that file.
