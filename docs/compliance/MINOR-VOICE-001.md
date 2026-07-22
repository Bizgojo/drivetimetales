# MINOR-VOICE-001 — Prohibition on Minor Voice Data in Production

**Status:** ACTIVE  
**Effective:** 2026-07-22  
**Owner:** Atlas (Technology & Operations)  
**Approved by:** Marc Postlewaite  
**Review cycle:** Annual, or immediately upon any change to ElevenLabs ToS / applicable law  
**Cross-reference:** Flag for MASTER_BIBLE v3.1 — do not modify this document to merge those edits; update the Bible separately under Marc's merge authority.

---

## 1. Rule Statement

**No voice data from any person under the age of 18 is recorded, stored, uploaded to ElevenLabs or any third-party voice synthesis platform, or used in any Endless Tales production, under any circumstance.**

This prohibition is absolute. It applies to:

- Voice clones derived from recordings of a minor
- Audio recordings of a minor submitted for any ElevenLabs API call, including for speaker diarization, voice design, or quality reference
- Voice samples, audition recordings, or raw session audio from a minor
- Any derivative audio asset where a minor's voice appears as a speaking character—even briefly, even non-prominently
- Any voice a reasonable listener would identify as a child, even if the underlying performer is technically an adult

**No exception exists for parental or guardian consent.** ElevenLabs' own terms of service do not treat parental consent as an override to their minor voice prohibition (see §2). Obtaining consent does not cure a ToS violation with the platform. This rule therefore makes consent moot: the voice data never enters the pipeline regardless of who has approved it.

This rule applies to all personnel, agents, contractors, AI systems, and automated pipelines operating on behalf of Endless Tales.

---

## 2. Rationale

### 2.1 ElevenLabs Terms of Service and Privacy Policy

ElevenLabs explicitly restricts the use of its services in connection with minors' voice data across multiple policy documents:

- **Terms of Service — Acceptable Use:** ElevenLabs prohibits using the platform to process, store, or generate voice content involving individuals who are or appear to be minors. This includes synthetic voices designed to sound child-like, which are separately prohibited from the ElevenLabs Voice Library.
- **Privacy Policy:** ElevenLabs states that the service is not directed to children under 13 and that users may not submit data from minors. The policy does not provide a parental-consent mechanism for voice data submitted through the API.
- **Voice Library Policy:** Adult voices specifically designed or trained to produce child-like or juvenile tonal output are prohibited from the Voice Library marketplace.

> ⚠️ **Policy verification note:** ElevenLabs ToS and Privacy Policy are living documents. The general contours above reflect the policy as understood at the time of writing (2026-07-22). Atlas is responsible for re-verifying cited provisions at each annual review and immediately following any ElevenLabs policy update notification.

### 2.2 Account Termination Risk

Every audio asset Endless Tales produces through ElevenLabs is traceable to a single licensed account. A confirmed ToS violation—including submission of minor voice data—is grounds for immediate and permanent account termination under ElevenLabs' enforcement policies. Loss of the account would:

- Immediately halt all ongoing and queued voice production
- Invalidate all existing voice clones and custom voice IDs stored in the account
- Require full pipeline reconstruction on a new account with a new voice roster
- Eliminate access to ElevenLabs credits, regardless of balance

Given that the pipeline currently runs ~2–3 episodes per day through ElevenLabs and the account holds a significant credit balance, account loss constitutes an existential production risk. The correct preventive posture is a categorical upstream block—not a downstream review.

---

## 3. Secondary Legal Exposure

*The following is a factual summary of statutes and legal theories that create potential exposure. It is informational only and does not constitute legal advice. Consult qualified legal counsel before making any decisions based on this section.*

### 3.1 Biometric Privacy Statutes

Several states have enacted biometric privacy laws that treat voiceprints as biometric identifiers. Under these frameworks, collecting a voiceprint without prior written consent, or sharing it with a third party (here, ElevenLabs via API), triggers statutory liability.

**Illinois — Biometric Information Privacy Act (BIPA), 740 ILCS 14:**  
BIPA is the most aggressive biometric statute in the United States. It requires informed written consent before collecting biometric data, prohibits sale or disclosure without consent, and mandates a retention and destruction policy. Critically, BIPA provides a **private right of action**: $1,000 per negligent violation and $5,000 per intentional or reckless violation, per person, per occurrence. Illinois courts have allowed class certification, and BIPA class actions have produced settlements in the hundreds of millions of dollars. Because Endless Tales produces content for national distribution and may collect voice data from Illinois residents, BIPA applies to any voice recording session conducted with an Illinois-based subject.

**Texas — Capture or Use of Biometric Identifier Act (CUBI), Tex. Bus. & Com. Code §503.001:**  
CUBI prohibits capture of a biometric identifier for commercial purposes without informed consent. Enforcement is by the Texas Attorney General (no private right of action). Civil penalties up to $25,000 per violation.

**Washington — Biometric Privacy Law, RCW 19.375:**  
Washington's biometric statute covers the collection and use of biometric identifiers, including voiceprints, requiring informed consent and limiting commercial use. Enforcement by the AG, with per-violation penalties.

**Applicability to minors:** Under all three statutes, a minor cannot legally provide the consent required to authorize collection of their biometric data. Even with parental consent, the statutory frameworks are unsettled as to whether parental consent is a valid substitute for the individual's own consent once that individual reaches majority. Avoiding the situation entirely is the only clean posture.

### 3.2 COPPA (Children's Online Privacy Protection Act, 15 U.S.C. §6501)

COPPA applies to online services that collect personal information from children under 13. A voice recording is personal information under COPPA's definition. If Endless Tales were to record and upload a voice from a subject under 13:

- COPPA compliance would require verifiable parental consent under FTC-prescribed mechanisms
- Disclosure requirements, data minimization rules, and deletion-on-request obligations would apply
- FTC civil penalties currently run up to $51,744 per violation per day
- State AGs may bring parallel enforcement actions

COPPA liability would arise independently of and in addition to ElevenLabs ToS violations.

### 3.3 Child Performer, Labor, and Trust-Account Requirements

Recording a minor for commercial audio production in many states requires compliance with child performer laws:

- **California (Coogan Law, Cal. Lab. Code §1700.37 and Family Code §6750):** 15% of gross earnings must be set aside in a blocked trust account ("Coogan account") for the minor's benefit. Work permits and parental supervision requirements apply. Noncompliance exposes the contracting party to civil liability and makes contracts voidable.
- **New York (Arts and Cultural Affairs Law §35.03; Labor Law §151):** Similar trust-account and permit requirements for minors in entertainment.
- **Other states:** Multiple states have analogous statutes. The applicable law is that of the state where recording occurs, not Endless Tales' place of incorporation.

Even if the recorded content is brief or incidental, a commercial engagement with a minor for the purpose of producing audio for a subscription product likely triggers these statutes.

### 3.4 Right of Publicity and Contract Disaffirmance

**Disaffirmance:** In most U.S. jurisdictions, contracts entered into by minors are voidable at the minor's election upon reaching majority (age 18). A minor performer who agreed to a voice recording or licensing arrangement could disaffirm that contract after turning 18, potentially requiring removal of published content, elimination of revenue derived from that content, and restitution.

**Right of Publicity:** Every state recognizes, in varying degrees, a right of publicity protecting individuals' commercial use of their name, likeness, and voice. A minor's right of publicity is held on their behalf by parents or guardians until majority, at which point the minor can enforce it directly. A published audio catalog containing a recognizable minor's voice creates a right-of-publicity claim that survives for the life of the individual in many states, plus post-mortem extensions in some jurisdictions.

**Practical risk:** Endless Tales is building a permanent catalog. Content produced now may still be in active distribution a decade from now. A voice that belonged to a 16-year-old in 2026 belongs to a 26-year-old in 2036, with full standing to assert both disaffirmance (of any prior agreement) and right of publicity.

---

## 4. Approved Alternatives

When a story requires a speaking child character, the following production approaches are approved:

| Situation | Approved Approach |
|-----------|-------------------|
| Child character with speaking lines | Cast an adult voice actor whose natural vocal register reads as younger; direct for appropriate character delivery |
| Child character with speaking lines | Use ElevenLabs Voice Design to generate a synthetic voice matching the character description—ensure the EL Voice Design pipeline does not submit real voice recordings as input |
| Child character with speaking lines | Apply post-production pitch elevation and formant shifting in the final mix; document parameters in the story's production notes for consistency across episodes |
| Child character as a narrative presence | Rewrite the character so they appear but do not speak (described action, dialogue reported by adult narrator); this is the lowest-risk option and is often the most elegant |
| Child character with short or isolated lines | Assign lines to the narrator in-character; adult narrator adopts a distinct delivery for the character without submitting any additional voice data |

**Hard constraint:** Under no approved alternative is a real minor's voice recorded, even briefly, even as a reference sample. ElevenLabs Voice Design is acceptable only if it operates on text prompts and EL's internal synthetic models—not on uploaded reference audio from a real child.

---

## 5. Enforcement

### 5.1 Brief-Stage Gate (Primary)

Any story brief or cast sheet that specifies a speaking character under 14 years of age is **rejected at brief stage** by Hal, before any script is drafted and before any voice generation is queued.

The enforcement trigger is age, not role prominence. A speaking child character in a single scene is rejected with the same force as a child narrator for an entire series.

The rejection message must specify:
1. The character name and specified age
2. A reference to MINOR-VOICE-001
3. One or more approved alternatives from §4

Hal must not attempt to resolve the issue by silently adjusting the character's stated age in the brief. Age changes require explicit author or Atlas instruction and must be logged.

### 5.2 Script-Stage Verification (Secondary)

The preflight validator must check the final script for any character header whose associated character description or age annotation indicates a minor. A character described as "12-year-old Tommy" or "child" who has a NARRATOR/CHARACTER header and assigned voice lines triggers a script-stage block, independent of whether the brief was flagged.

**Implementation note:** This check is a planned addition to the preflight pipeline (ATL backlog). Until implemented, Atlas is responsible for manual review of any story brief where a child character appears.

### 5.3 Escalation

Any ambiguous case (character age unspecified but contextually reads as a minor; request for a "child-like" voice from an adult performer) is escalated to Atlas. Atlas holds the matter and reports to Marc if the resolution requires a policy decision.

---

## 6. Audit — Existing Published and Queued Catalog

**Audit date:** 2026-07-22  
**Auditor:** Atlas  
**Scope:** All stories in workflow states: `published`, `ready_for_review`, `approved_ready`, `repair_queue`, `needs_attention` (155 stories total)

### 6.1 Methodology

1. **Title keyword search:** Queried `stories` table for titles containing: `child`, `kid`, `teen`, `young`, `boy`, `girl`. Result: **0 matches** in active pipeline states.

2. **Narrator voice roster review:** Queried all rows in `narrator_voices` table. 58 total voices. Age brackets present:
   - `adult` — 32 voices
   - `middle_aged` — 13 voices
   - `old` — 6 voices
   - `young` — 7 voices

   The 7 `young`-bracket narrators were individually reviewed against their descriptions and ElevenLabs voice IDs:

   | Name | Description | Assessment |
   |------|-------------|------------|
   | Priya Lunden | "Science journalist with warmth and genuine wonder" | Adult — professional adult register |
   | Amara Daye | "Sweeping historical adventure. Sun-scorched, romantic." | Adult — epic/romantic adult register |
   | Valf | "Young, energetic male with a playful, sarcastic edge" | Adult — "young" here denotes character type (20s energy), not age below 18 |
   | Vera Koss | "Built for deep space. Clear and propulsive." | Adult — sci-fi professional register |
   | Darcy Morse | "Acidic, dark, razor-sharp. Unreliable narration." | Adult — psychological thriller register |
   | Nate Holford | "Warm, conversational, observational young male." | Adult — horror/comedy register; "young" = character type |
   | Sasha Laine | "Cool, crisp, controlled. International espionage texture." | Adult — thriller/espionage register |

   **Finding:** All 7 `young`-bracket narrators are adult voice profiles. None are described as child-like or minor-appropriate. No remediation required.

3. **`go_variant_config` table:** Reviewed. 3 rows (variants a, b, bare). No voice-related fields that would suggest minor voice data. Clean.

4. **Script-level scan:** Automated keyword scan of story titles. Full script-text audit not automated at this time. See §5.2 note on planned preflight addition.

### 6.2 Finding

**CLEAN.** No child voice assets identified in the published catalog, active pipeline, or narrator voice roster. No remediation required.

### 6.3 Limitations and Ongoing Obligations

- This audit covered story titles and the narrator voice roster. It did not perform automated full-text analysis of all 155 story scripts for child character speaking lines. A complete script-level audit is recommended as a one-time sweep and should be built into the preflight validator (§5.2).
- The audit covers only assets created and managed within the Endless Tales pipeline. It does not cover legacy `landing_stories` assets created prior to the current production pipeline (which predate current governance controls). Those assets should be reviewed separately.
- The audit must be repeated annually and immediately following any new casting decision that introduces a `young`-bracket or otherwise ambiguous-age narrator voice.

---

## 7. Document Control

| Field | Value |
|-------|-------|
| Document ID | MINOR-VOICE-001 |
| Version | 1.0 |
| Created | 2026-07-22 |
| Author | Atlas |
| Next review | 2027-07-22 |
| Supersedes | None |
| MASTER_BIBLE flag | Cross-reference in v3.1 §[Casting and Voice Policy]; do not embed full text |
