# ATL-PIPE-008: validate_script Autonomous Retry Gap

**Raised by:** Orion  
**Date:** 2026-06-14  
**Priority:** P1 — Smoke test blocker  
**Owner:** Atlas  

## Problem

When `validate_script` fails (either deterministic `validateCardCopy` or AI editorial), the pipeline marks the job `status=failed` with no autonomous repair path. The `error_json` uses a raw object — missing `kind`, `marc_required`, `autonomous_repair`, `retry_count`, `playbookId`, `safe_resume_point`, `learning_incident_id`. No learning incident is created. No retry occurs.

This means a single bad AI-generated DESCRIPTION word terminates a production job and requires Orion/Marc to manually reset it. That is human intervention, which disqualifies any smoke-test story.

## Observed Evidence (2026-06-14)

- **Story #2** (The Cartwright Letter, `a049cbe2`): failed `validate_script` because DESCRIPTION contained "forged" — a blocked word caught by deterministic `validateCardCopy`. Job: `1a592963`.
- **Story #3** (The Night Watchman's Log, `4beff83c`): failed `validate_script` — AI validator flagged editorial quality issue and description mismatch. Job: `e82d4246`.
- Both `error_json` objects had `kind: undefined`, `marc_required: undefined` — confirming `buildStructuredError` was not called.
- Neither failure created a `production_learning_events` row.

## Required Implementation

### 1. Structured error_json on all validate_script failure paths

Replace raw `error_json` object in the `!result.passed` branch of the `validate_script` step handler with `buildStructuredError(...)`.

Required fields:
```typescript
buildStructuredError(
  kind,           // 'script_blocked_word' | 'script_editorial_quality'
  message,        // human-readable failure summary
  'validate_script',
  {
    storyId,
    marc_required,        // false for retries 1-2; true on retry 3+
    autonomous_repair,    // true for retries 1-2
    retry_count,          // how many times generate_script has been retried
    playbookId,           // 'script_validate_retry' (new playbook)
    safe_resume_point,    // 'generate_script'
    learning_incident_id, // UUID of row written to production_learning_events
  }
)
```

### 2. Auto-retry logic (max 2 retries)

In the `validate_script` step handler, when `result.passed === false`:

**Determine failure kind:**
- If `validateCardCopy` caught it → `kind = 'script_blocked_word'`
- If AI validator caught it → `kind = 'script_editorial_quality'`

**Get retry count** from `job.state_json.validateScriptRetryCount` (default 0).

**If retry_count < 2:**
1. Write a `production_learning_events` row:
   - `failure_type`: kind
   - `root_cause`: brief description of what the validator flagged
   - `fix_applied`: 'Autonomous retry: cleared script, reset to generate_script'
   - `fix_type`: 'autonomous_retry'
   - `prevention_rule`: 'Script generation AI must avoid blocked description words; retry improves compliance'
   - `reusable`: true
   - `confidence`: 0.85
2. Clear the generated script from the story row (`script = null`, `script_json = null`, `validator_result = null`, `validator_report = null`, `status = 'draft'`)
3. Reset the job:
   - `status = 'queued'`
   - `current_step = 'generate_script'`
   - `state_json.validateScriptRetryCount = retry_count + 1`
   - `error_json = buildStructuredError(...)` with `marc_required: false, autonomous_repair: true`
   - `locked_at = null`, `locked_by = null`
4. Log the retry with `source = 'autonomous-runner'`
5. Return HTTP 200 (success — runner advanced the job back to generate_script)

**If retry_count >= 2 (third failure):**
1. Write learning incident as above
2. Mark job `status = 'failed'`
3. `error_json = buildStructuredError(...)` with `marc_required: true, autonomous_repair: false`
4. Return HTTP 422

### 3. New repair playbook: `script_validate_retry`

Add to `lib/repairPlaybooks.ts`:
```typescript
{
  id: 'script_validate_retry',
  failureKind: 'script_blocked_word',  // also handles 'script_editorial_quality'
  title: 'validate_script failed — autonomous retry',
  autonomous: true,
  marcRequired: false,
  priority: 'normal',
  steps: [
    { kind: 'clear_script', description: 'Clear generated script and validation state from story row.' },
    { kind: 're_queue', description: 'Reset job to generate_script. Runner will regenerate on next cycle.' },
  ],
  prevention: 'Script generation prompt should avoid blocked DESCRIPTION words. See blocked-words list in validateCardCopy().',
  verificationCheck: 'Job transitions from validate_script FAIL back to generate_script and produces a passing script.',
  linkedIncident: 'ATL-PIPE-008',
}
```

### 4. Add `classifyValidateScriptFailure()` helper

Near the top of the validate_script step handler:
```typescript
function classifyValidateScriptFailure(report: string): StructuredErrorJsonKind {
  if (/blocked word|DESCRIPTION_PAST_TENSE|forbidden/i.test(report)) return 'script_blocked_word'
  return 'script_editorial_quality'
}
```

### 5. Tests

Add to `__tests__/learning-system-regression.test.js`:
- Blocked word DESCRIPTION ('forged') → kind='script_blocked_word', autonomous_repair=true, retry_count=1
- Editorial failure → kind='script_editorial_quality', autonomous_repair=true, retry_count=1  
- Third failure → marc_required=true, autonomous_repair=false
- retry_count < 2 → job reset to generate_script (not failed)
- retry_count >= 2 → job status=failed, marc_required=true

## Files to Change

1. `app/api/admin/production-jobs/run-next/route.ts` — validate_script step handler (~line 5176)
2. `lib/repairPlaybooks.ts` — add `script_validate_retry` playbook
3. `lib/pipeline-runner/types.ts` — add `script_blocked_word` and `script_editorial_quality` to `StructuredErrorJsonKind`
4. `__tests__/learning-system-regression.test.js` — add test cases

## Acceptance Criteria

1. `tsc --noEmit` passes clean on changed files
2. `npm run build` passes
3. New Jest tests pass (run: `npx jest __tests__/learning-system-regression.test.js --no-coverage`)
4. All validate_script failure paths use `buildStructuredError` with all 8 required fields
5. First and second failures reset job to `generate_script` with learning incident written
6. Third failure → `status=failed`, `marc_required=true`
7. `script_validate_retry` playbook exists in repairPlaybooks.ts
8. `script_blocked_word` and `script_editorial_quality` are valid `StructuredErrorJsonKind` values
9. **Orion verifies live in Supabase** before smoke-test stories are created

## Must NOT

- Touch `generate_script` step logic
- Touch `voice_preflight`, `generate_voices`, or any other step
- Add new npm packages
- Use inline styles

## Constraint: ORION-OPS-001

Before any new stories are queued after this fix:
1. Confirm `git log origin/main -1` matches the fix commit
2. Wait 3 minutes for Vercel build
3. Verify Vercel deployment is live
4. Only then signal Orion to create new stories
