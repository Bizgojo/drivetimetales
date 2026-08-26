# Validation Gate

Pre-assembly quality checks that must pass before a final_mix is built.

Each check is a standalone JavaScript module callable from scripts or the pipeline.

## Checks

| Check | File | Catches |
|-------|------|---------|
| **Check 1 — Layer 1**: Duplicate/Triplicate | `check1-duplicate-segments.js` | Same voice line appearing 2× (DUPLICATE) or 3× (TRIPLICATE) — exact match, HARD FAIL |
| **Check 1 — Layer 2**: Script-level repeats | `check1-duplicate-segments.js` | Near-duplicate lines (≥85% JW similarity): INTENTIONAL or ACCIDENTAL candidates — informational |
| Check 2–6 | _(pending)_ | _(pending)_ |

---

## Check 1: Duplicate/Triplicate Segment Detection

**Catches:** The EP8 v4 incident where:
- `"He was right on both counts, of course."` appeared in segments 0133, 0135, 0136 (TRIPLICATE)
- `"That's where they gave the made ones their name."` appeared in segments 0142, 0144 (DUPLICATE)

**When to run:** After a script is finalized and before `render_final_mix` assembles the
segment files.  Can also be run after `generate_voices` as a sanity check that segment
content matches the script.

### API

```js
const { checkDuplicateSegments, formatCheck1Report } = require('./check1-duplicate-segments')

const result = checkDuplicateSegments(scriptText)
// result.passed          → boolean
// result.findings        → array of { severity, originalText, occurrences, count }
// result.summary         → { totalVoiceSegments, duplicateCount, triplicateCount }

console.log(formatCheck1Report(result, storyId))
```

### CLI

```bash
# Check live EP8 script from DB (both layers)
node scripts/validation-gate-check1.js --story-id 410d82dc-1dbd-4470-b8e8-a45f1c615597

# Run against the pre-v5 EP8 Layer 1 fixture (demonstrates the v4 duplicate/triplicate bug)
node scripts/validation-gate-check1.js --fixture pre-v5-ep8

# Run against the pre-v6 EP8 Layer 2 fixture (demonstrates the 'Ruth showed him how' accidental duplicate)
node scripts/validation-gate-check1.js --fixture pre-v6-ep8-l2

# JSON output (both layers combined)
node scripts/validation-gate-check1.js --story-id <uuid> --json
```

## Layer 2: Script-Level Repeat Detection

**Exported constant:** `ADJACENT_THRESHOLD = 3`

**Algorithm:** Jaro-Winkler similarity (≥0.85) on normalized text of all expected voice-segment pairs.

**Classification:**
- `gap = B.index - A.index` (position index from `parseScriptPositions`, includes all position types)
- `gap ≤ ADJACENT_THRESHOLD` → `SCRIPT_INTENTIONAL_CANDIDATE` — deliberate echo/emphasis, route to Hal for review
- `gap > ADJACENT_THRESHOLD` → `SCRIPT_ACCIDENTAL_CANDIDATE` — likely a script error, route to Hal for fix

**Exit code:** Layer 2 findings are **informational only** — do NOT change exit code (only Layer 1 hard fails trigger exit 1).

### API

```js
const {
  detectScriptLevelRepeats,
  formatCheck1L2Report,
  ADJACENT_THRESHOLD,
} = require('./check1-duplicate-segments')

const { parseScriptPositions } = require('./check1-duplicate-segments')
const positions = parseScriptPositions(scriptText)
const segments  = positions
  .filter(p => p.kind === 'voice' && p.isExpected)
  .map(p => ({ index: p.index, speaker: p.speaker, text: p.text }))

const findings = detectScriptLevelRepeats(segments)
// findings[n].type     → 'SCRIPT_ACCIDENTAL_CANDIDATE' | 'SCRIPT_INTENTIONAL_CANDIDATE'
// findings[n].gap      → position-index delta
// findings[n].similarity → Jaro-Winkler score (0–1)
// findings[n].message  → human-readable summary string

console.log(formatCheck1L2Report(findings))
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All clean — no duplicates |
| 1 | Duplicates or triplicates found — BLOCKED |
| 2 | Fatal error (missing env, DB error, etc.) |
