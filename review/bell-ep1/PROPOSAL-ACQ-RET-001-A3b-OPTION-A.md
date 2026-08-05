# PROPOSAL — ACQ-RET-001 A3b Amendment, Option A
**Status:** PROPOSAL ONLY — not committed. Marc commits.  
**Date drafted:** 2026-08-05  
**Decision logged:** `bell-a3b-option-a = option-a-belle-free` (decisions/2026-08-05.json)  
**Do not implement EP1-SCRIPT.md changes until Marc commits this diff.**

---

## WHAT THIS AMENDS

Section A3b of ACQUISITION-RETENTION-001 currently requires Belle's welcome-by-name on the first post-signup episode, unconditionally. Bell EP1 carries BELLE_GATE: A (acquisition ramp episode, no Belle B intro per Marc ruling 2026-08-03). These conflict. This amendment adds a BELLE_GATE: A exception to A3b.

---

## DIFF — governance/ACQUISITION-RETENTION-001.md

```diff
--- a/governance/ACQUISITION-RETENTION-001.md
+++ b/governance/ACQUISITION-RETENTION-001.md
@@ Section A3b @@

 ### A3b. The post-signup transition (anonymous → known)
 - **Seamless auto-continue:** the instant name + email are entered, playback
   **auto-continues into the first post-signup episode** — no manual restart,
   no dead stop on the cliffhanger.
-- **Belle's first appearance:** that first post-signup episode **opens with
-  Belle warmly welcoming the listener to Endless Tales by name**, then flows
-  into the personalized intro and the episode. This is the anonymous→known
-  handoff.
-- **One-time welcome:** the "welcome to Endless Tales" plays **only on this
-  first post-signup episode**. Every episode after gets Belle's standard
-  personalized intro, not the welcome again. *(Confirm with Marc if he wants
-  it every session instead.)*
+- **Belle's first appearance:** that first post-signup episode **opens with
+  Belle warmly welcoming the listener to Endless Tales by name**, then flows
+  into the personalized intro and the episode. This is the anonymous→known
+  handoff.
+  **EXCEPTION — BELLE_GATE: A:** When the first post-signup episode carries
+  BELLE_GATE: A (acquisition ramp designation), it is fully Belle-free: no
+  intro, no outro, no welcome-by-name. The one-time "welcome to Endless Tales
+  by name" moves to the second post-signup episode (EP2). EP2 opens with the
+  welcome, then its standard personalized intro. Every episode after EP2 gets
+  the standard personalized intro only. The BELLE_GATE: A exception applies
+  only to the first post-signup episode; no subsequent episode may carry it.
+- **One-time welcome:** the "welcome to Endless Tales" plays **only once** —
+  on the first post-signup episode without BELLE_GATE: A. Every episode after
+  gets Belle's standard personalized intro, not the welcome again.
```

---

## CONSEQUENT DIFF — review/bell-ep1/EP1-SCRIPT.md (do not apply until A3b is committed)

```diff
--- a/review/bell-ep1/EP1-SCRIPT.md
+++ b/review/bell-ep1/EP1-SCRIPT.md
@@ final lines of script @@

 NARRATOR: Mara sat in the room her mother had built and held a key she had no
 lock for yet and listened to the silence that a gunshot leaves behind it —
 the specific, particular silence that is different from all the silence that
 came before.
-
-BELLE B: Lena went into the dark, and the gun went off once. Next episode —
-Mara learns what Lena found. And whether Eli knew about the tunnel before she
-called him.
```

EP1 ends on the final narrator line. No Belle B block of any kind.

---

## WHAT HAPPENS NEXT (after Marc commits)

1. EP2 brief must include: "First post-signup episode after BELLE_GATE: A EP1. Opens with Belle one-time welcome by name, then standard personalized intro, then episode."
2. Gate B item 2 (Belle personalized intro/outro) clears: EP1 Belle-free is canon under the amendment.
3. Gate B item 3 (welcome by name) clears: welcome confirmed moving to EP2.
4. No changes to EP1 production script until Marc commits this diff.

---

*Atlas, 2026-08-05 — PROPOSAL only, not self-ratified*
