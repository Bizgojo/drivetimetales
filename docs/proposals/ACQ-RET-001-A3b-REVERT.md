# Proposal: ACQ-RET-001-A3b-REVERT — Correct Episode Gate Classification for Bell EP1 and EP2

**Proposal ID:** ACQ-RET-001-A3b-REVERT  
**Prepared by:** Hal (Endless Tales Creative Agent)  
**Date:** 2026-08-06  
**Target file:** `governance/ACQUISITION-RETENTION-001.md`  
**Status:** PENDING MARC APPROVAL — do not commit governance file directly

---

## Problem

The current governance document classifies **EP1** as Gate A (acquisition layer, pre-signup, no Belle) and describes the Belle A3b welcome as belonging to EP1 for promo converts. This is incorrect for the Bell Beneath Falls Park series, where the promo videos (PV1, PV2, PV3) serve the full acquisition ramp and EP1 is the **first episode a signed-up member hears**.

The current script for Bell EP2 was initially authored against a mistaken gate assignment for EP2's OPENING-A, which placed the scene in a post-Room-217 alley consistent with a different version of EP1's ending — confirming the gate confusion propagated into production work.

---

## What Was Wrong

| Assumption (incorrect) | Correct classification |
|------------------------|------------------------|
| EP1 = acquisition layer, Gate A, no Belle | EP1 = member episode, Gate B, standard Belle intro + outro |
| EP1 promos are PV-equivalent | PV1, PV2, PV3 are the acquisition ramp; EP1 is the first member episode |
| Belle A3b welcome belongs in EP1 | Belle A3b welcome belongs in EP2 (first post-signup episode for promo converts) |
| OPENING-A of EP2 bridges from EP1 v2 (alley/Room 217) | OPENING-A of EP2 bridges from EP1 v1's ending (tunnel, gunshot, hidden room) |

---

## Fix Required in governance/ACQUISITION-RETENTION-001.md

### 1. Episode Gate Table

Add or update the Bell Beneath Falls Park episode gate table to reflect:

| Episode | Gate | Belle | Notes |
|---------|------|-------|-------|
| PV1 | A (acquisition) | None | Cold open, no card, ramp step 1 |
| PV2 | A (acquisition) | None | Ramp step 2 |
| PV3 | A (acquisition) | None | Ramp step 3. Ends on cliffhanger → signup wall |
| EP1 | B (member) | Standard intro + outro | First member episode. Existing members enter directly. |
| EP2 | B (member) + A3b welcome (promo converts only) | Standard intro + outro; B-variant opening for promo arms | First post-signup episode for promo converts. Members who completed EP1 get standard OPENING-A. |
| EP3+ | B (member) | Standard intro + outro | All listeners on same path after EP2 merge. |

### 2. A3b Placement Clarification

Current language in A3b describes the Belle welcome as belonging to the first post-signup episode. For Bell Beneath Falls Park, this is **EP2**, not EP1. The governing rule should be stated as:

> The A3b welcome plays in the first episode a promo-convert listener hears after signing up. For Bell Beneath Falls Park, that episode is EP2. EP1 is a member episode with standard Belle; it receives no A3b welcome.

### 3. BELLE_GATE Header Update

The `BELLE_GATE` header in EP1's script has been updated from `A` to `B` in the production script (`docs/bell-ep1/EP1-v1-with-belle-intro.md`). The governance document should reflect that `BELLE_GATE: B` means: standard Belle intro (one-line, names listener + episode) plus standard Belle outro (cliffhanger tease, next-episode hook).

---

## What Does NOT Change

- The A3b rule itself (one-time welcome, first post-signup episode only) is correct.
- The gate-position test (Test A/B/C, i.e. how many PV episodes before the signup wall) is unchanged.
- EP2's OPENING-B variants (B1/B2/B3) correctly implement A3b for the three promo arms.
- All episodes after EP2 receive standard Belle, no A3b welcome.

---

## Marc Action Required

Marc reviews this proposal and commits the corresponding changes to `governance/ACQUISITION-RETENTION-001.md`. No agent commits that file.
