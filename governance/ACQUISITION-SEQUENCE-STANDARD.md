# ACQUISITION SEQUENCE STANDARD

**Declared by:** Marc Postlewaite  
**Date:** Aug 8, 2026  
**Status:** CANON — binding on all future acquisition series  
**Owner:** Atlas  

---

## PURPOSE

Bell Beneath Falls Park required a second landing-page deployment pass because PV and EP1/EP2 scripts were written separately and the landing page was built before PV audio existed. This standard prevents that pattern.

The root problem: PVs and EP1 must land on an identical cliffhanger, and EP2 must work cold from both the promo door and the library door. When written separately, the welcome copy becomes a patch over the seam — instead of a door that opens cleanly.

---

## THE STANDARD

For every future acquisition story (a story used to drive ad traffic into a series funnel):

### 1 — Batch authorship

EP1, EP2, and all PVs (PV1/PV2/PV3) are written **as one batch, by one author, in one continuity pass.**

- The author writes EP1 and EP2 first to lock the narrative through-line and cliffhanger.
- PVs are written after EP1 and EP2 are complete, derived from the same continuity.
- EP3–EP7 (or equivalent continuation episodes) are written after — they never touch the funnel.

### 2 — Render order

Render order is fixed:

1. EP1 + EP2 (together)
2. EP1 ear-approval by Marc
3. PVs (after EP2 is ear-approved)
4. PV ear-approval by Marc
5. EP3–EP7 (after the funnel is locked and approved)

No continuation episode is rendered before the funnel (EP1 + EP2 + PVs) is ear-approved.

### 3 — Landing page gate

The landing page is **not built until PV audio is real.**

- `BELL_EP2_DEST` (or equivalent destination URL) must be the actual story ID of a published EP2, not a placeholder.
- `BELLE_WELCOME_URL` (or equivalent welcome audio URL) must be the URL of a rendered, ear-approved Belle welcome file, not a placeholder.
- No landing page deployment proceeds with placeholder values in any required field.

### 4 — Belle welcome audio

The Belle PV-welcome catch-up text is written **as part of the batch** (same continuity pass as EP1, EP2, and PVs) and rendered **alongside PV audio** — not afterward.

---

## WHAT THIS PREVENTS

| Failure | Prevented By |
|---------|-------------|
| PV cliffhanger doesn't match EP1 ending | Batch authorship — same pass |
| EP2 cold-open doesn't work from promo door | EP2 written knowing promo exists |
| Welcome copy patches seam rather than fits | Written in same pass as content it bridges |
| Landing page deployed with placeholders | Hard gate: no deploy until audio URLs are real |
| Second deploy pass required | Gate prevents first deploy until complete |

---

## APPLICATION

This standard applies from Aug 8, 2026 forward. It applies to Bell EP3–EP7 as continuation episodes (they were written after the funnel — correct). It applies to any future series using the acquisition funnel model (promo → landing → EP2 cold-open → CTA).
