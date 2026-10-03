# ENDLESS TALES / ETD — AGENT FLEET ARCHITECTURE

**Version:** 1.0
**Status:** CANON
**Approved by:** Marc Postlewaite
**Date:** 2026-10-03
**Supersedes:** All prior informal fleet descriptions (Ground Truth fleet table dated 2026-08-09, Autonomy Plan operating-model section dated 2026-08-11/12, and any agent-authored architecture proposals). This is the authoritative version until Marc commits a new one with a version bump.

---

## 0. Standing rule on this document

This document was drafted by Claude from a proposal Marc reviewed and approved. **No agent may revise, reinterpret, or re-declare any part of this architecture.** Changes happen only when Marc approves a new version, committed to `docs/` with a version bump and this version moved to `docs/Archive/`.

---

## 1. System overview

Endless Tales Autonomous (ETD) is a multi-agent system that plans stories, generates content, enforces canon, optimizes subscriber growth, manages product experience, handles finance and legal, and publishes automatically. It separates work into two kinds:

- **Persistent agents** — standing, always-on, genuinely need continuity between tasks.
- **Playbook + disposable-subagent roles** — no standing agent; a fresh subagent is spawned per task by Orion, fed a versioned playbook, and discarded when the task ends.

This split exists because every prior attempt at standing agents for roles that don't need continuity went dark silently (Susan: 26 days; Atlas: since Jul 17, 2026; Maya/Vega: since May 2026) and every real deliverable from those roles actually came from a disposable Orion subagent wearing that persona. Model B (Susan, confirmed Sep 18, 2026) proved the disposable-subagent-plus-playbook pattern works; this document extends it to the rest of the fleet.

---

## 2. Persistent agents (4)

### Orion — Chief Operating Officer (COO)
- **Model:** Meta Muse-Spark 1.3 (primary), fallback `claude-opus-4-8`
- **Reports to:** Marc
- **Resides:** `~/.openclaw/workspace-orion` (active Telegram)
- **Responsibilities:** Full workflow orchestration. Spawns and routes to all disposable-subagent roles. Integrates Strategos's Story Planning Blueprint and Susan's marketing priorities. Ensures Canon Registry compliance. Decides publish-vs-revise. Reads/writes shared Hindsight. Tracks liveness of the 3 other persistent agents.
- **Hard limits:** Must NOT build infrastructure, write code, or self-validate its own or any other agent's work. Coordination only.

### Strategos — Chief Strategy Officer (CSO)
- **Model:** DeepSeek R1 (`deepseek-reasoner`)
- **Reports to:** Orion / Marc
- **Responsibilities:** Audience analysis, genre performance analysis, retention/completion analysis, subscription optimization, market trend analysis. Produces the Story Planning Blueprint (for Orion + Hal) and the Marketing Story Recommendation Report (for Susan + Orion). Writes strategic insights to shared Hindsight.

### Lyra — Chief Technology Officer (CTO)
- **Model:** DeepSeek R1 (`deepseek-reasoner`)
- **Reports to:** Orion / Marc
- **Resides:** `~/.openclaw/workspace-deepseek-r1`
- **Responsibilities:** Technical reasoning and architectural correctness. Reviews Atlas's code. Diagnoses pipeline failures. Designs new checks, policies, and pipeline improvements. Advises Orion on technical decisions. Writes engineering insights to shared Hindsight.
- **Standing rule:** Lyra verifies claims against the actual repo/filesystem/gateway config before acting — demonstrated on its first task (Oct 1, 2026) when it independently caught errors in Orion's P0 briefing. This discipline is expected of it going forward, not assumed by default.

### Atlas — Chief Engineer
- **Model:** DeepSeek V3 (`deepseek-chat`)
- **Reports to:** Orion / Lyra
- **Resides:** `~/.openclaw/workspace-deepseek-v3`
- **Responsibilities:** Writes code, builds pipeline modules, implements ASC3 transformations, maintains infrastructure scripts, fixes bugs, handles deployments, manages Stripe/cron/infra automation. Executes technical tasks Orion assigns. Writes engineering memory to shared Hindsight.
- **Note:** This role absorbs what was informally called "Vex" (a self-named subagent bootstrap from Oct 3, 2026). "Vex" is retired as a name; this is now Atlas's standing identity.

---

## 3. Playbook + disposable-subagent roles (7)

No standing agent exists for these. Orion spawns a fresh, disposable subagent per task, with no memory between tasks, fed the role's current playbook in full (every brief must carry full context — canon, IDs, constraints — the subagent knows nothing else). Model is chosen at spawn time (Claude by default for judgment/content work).

| Role | Responsibilities | Playbook status |
|---|---|---|
| **Hal** (Content Director) | Story scripts & quality control, ASC3 pipeline management, ElevenLabs credit management, post-launch production queue, series continuity/sequencing. Follows Strategos's Story Planning Blueprint; accepts rewrite instructions from Orion. | Needs drafting |
| **Vega** (Audio QC Manager) | ASC3 audio quality standard, full catalog QC audit, QC gate for all stories before Marc review, listening-time verification, Belle B voice consistency, applies Canon Registry rules. | Needs drafting |
| **Susan** (Marketing Manager) | Subscriber acquisition strategy, GTM plan & social channels, waitlist management, landing page brief, Founding Member strategy. Uses Strategos's marketing recommendations. | **Exists** — canonical copy on Google Drive (Susan Operating Charter Playbook v2.0, Sep 18, 2026) |
| **Maya** (Product/UX) | Subscriber experience evaluation, retention risk analysis, discovery/navigation audit, onboarding assessment, mobile experience QA. Feeds UX findings to Orion & Strategos. | Needs drafting |
| **Bart** (CFO) | Financial ground truth, Mercury/Stripe tracking, monthly recurring expenses, runway & cash forecast, budget/variance governance, expenditure review. Provides financial constraints to Strategos & Orion. | Needs drafting |
| **Lex** (General Counsel) | Terms of service & privacy policy, vendor contract review, IP/trademark protection, regulatory compliance, trial terms & refund policy, commercial licensing verification. Provides legal constraints to Orion & Strategos. | Needs drafting |
| **Scribe** (Head of Publishing) | Converts FinalMix → ASC3 API payload, adds metadata (series, arc, version, tags, narrator, marketing flags), publishes via ASC3 endpoint, handles errors/retries/validation. | Needs drafting |

---

## 4. Memory architecture (Hindsight)

- **Shared Hindsight** across Orion, Strategos, Lyra, Atlas, Hal, Vega, Susan, Maya, Scribe — needed for pipeline handoffs (e.g. Strategos's blueprint reaching Hal; QC results reaching Orion).
- **Isolated memory** for **Bart** and **Lex** — financial and legal specifics never enter or leave shared Hindsight. This exists so sensitive financial/legal detail doesn't surface unprompted in creative or marketing work (the same failure mode that once surfaced Marc's personal/family context inside Endless Tales work).

---

## 5. Pipelines

- **Story Production:** Strategos → Orion → Hal → Vega → Scribe
- **Marketing:** Susan ↔ Strategos → Orion → Hal → Vega → Scribe
- **Engineering:** Orion → Lyra → Atlas

---

## 6. Governance (carried forward from existing standing rules)

1. No agent declares canon. This document only changes when Marc commits a new version.
2. No agent checks another agent's work. Verification is either Claude (against GitHub, Supabase, or other direct evidence) or deterministic code — never one agent's self-report about another.
3. Orion coordinates only. It never validates, never builds infrastructure, never self-certifies its own pipeline's output.
4. Only the 4 persistent agents need liveness monitoring (last-active timestamp, flagged stale) — the 7 disposable roles have no standing session to go dark.
5. A disposable subagent's acceptance test must prove the result, not restate it (e.g. a full audio decode, not a reported duration figure).
6. `success: false` from any agent is a blocker to report, not a warning to reason past.

---

## 7. Open items

- Playbooks for Hal, Vega, Maya, Bart, Lex, and Scribe do not exist yet and need drafting before those roles can run reliably as disposable subagents.
- No part of this architecture (model assignments, agent configuration) has been verified against the live OpenClaw gateway config yet. Verification against config/GitHub/Supabase — not agent self-report — is required before treating any individual claim ("Atlas is configured on DeepSeek V3," etc.) as true in practice.
