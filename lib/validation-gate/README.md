# Validation Gate

Pre-assembly quality checks that must pass before a final_mix is built.

Each check is a standalone JavaScript module callable from scripts or the pipeline.

## Checks

| Check | File | Catches |
|-------|------|---------|
| **Check 1** — Duplicate/Triplicate Detection | `check1-duplicate-segments.js` | Same voice line appearing 2× (DUPLICATE) or 3× (TRIPLICATE) in the segment list |
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
# Check live EP8 script from DB
node scripts/validation-gate-check1.js --story-id 410d82dc-1dbd-4470-b8e8-a45f1c615597

# Run against the pre-v5 EP8 fixture (demonstrates the v4 bug)
node scripts/validation-gate-check1.js --fixture pre-v5-ep8

# JSON output
node scripts/validation-gate-check1.js --story-id <uuid> --json
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All clean — no duplicates |
| 1 | Duplicates or triplicates found — BLOCKED |
| 2 | Fatal error (missing env, DB error, etc.) |
