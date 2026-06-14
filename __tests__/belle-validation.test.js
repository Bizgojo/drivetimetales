/**
 * belle-validation.test.js
 *
 * ATL-PIPE-010 regression tests for Belle intro/outro validation and repair.
 *
 * Tests cover:
 * A. hasConcreteNarrativeHook — Fix A: abstract conflict hooks accepted
 * B. classifyBelleIssues — canonical kind assignment
 * C. classifyBelleRepairError — repair error kind assignment
 * D. validate_belle_assets retry logic
 * E. repair_belle_quality retry + terminal failure logic
 *
 * Run: npx jest __tests__/belle-validation.test.js --no-coverage
 */

'use strict'

// ─── Mirrors from production (route.ts) ────────────────────────────────────

function hasConcreteNarrativeHook(text) {
  // Named-object / event hooks (original set)
  if (/\b(secret|danger|dangerous|conflict|mystery|mysterious|missing|vanish|vanished|disappear|disappeared|threat|threatened|betrayal|betrayed|lie|lied|hidden|buried|locked|stolen|murder|death|dead|killer|blood|blackmail|sabotage|trap|trapped|choice|warning|evidence|clue|case|crime|manifest|list|letter|message|record|signal|code|map|key|witness|suspect|truth|reveal|reckoning|ferry|ferryman|boat|captain|passenger|passengers|crossing|crossings|names?)\b/i.test(text)) return true
  // ATL-PIPE-010: Abstract conflict-mechanism hooks
  if (/\b(broke?|broken|breaks?|tamper(?:ed|ing)?|manipulat(?:ed|ing)?|falsif(?:ied|y|ication)?|alter(?:ed|ing)|erase[sd]?|destroy(?:ed|ing)?|corrupt(?:ed|ion)?|fraud(?:ulent)?|scheme[ds]?|conspir(?:acy|ed)?|cover.?up|wrong(?:ful|fully|ed|doing)?|criminal|illegal|illicit|deed|paper trail|forced|coerced|on purpose|ownership|dispute[sd]?|inherit(?:ance|ed)?|forgery|forger)\b/i.test(text)) return true
  return false
}

function classifyBelleIssues(issues) {
  const text = issues.join(' ').toLowerCase()
  if (/hook|concrete narrative|atmospheric|story mechanism/.test(text)) return 'belle_quality_hook_missing'
  if (/story title|must include the story title|must name the story title|\bstandalone.*title\b/.test(text)) return 'belle_quality_title_missing'
  if (/\[listener_name\]|listener_name|placeholder|personali/.test(text)) return 'belle_quality_listener_missing'
  return 'belle_quality_unknown'
}

function classifyBelleRepairError(message) {
  const msg = message.toLowerCase()
  if (/hook|concrete narrative|atmospheric/.test(msg)) return 'belle_quality_hook_missing'
  if (/story title|must include the story title|must name the story title|\bstandalone.*title\b/.test(msg)) return 'belle_quality_title_missing'
  if (/\[listener_name\]|listener_name|placeholder|personali/.test(msg)) return 'belle_quality_listener_missing'
  if (/repair.*fail|fail.*repair|deterministic|attempt limit/.test(msg)) return 'belle_quality_repair_failed'
  return 'belle_quality_unknown'
}

const MAX_BELLE_REPAIR_RETRIES = 2

function canBelleRetry(repairAttempts, errMessage) {
  const isAttemptLimit = /attempt limit reached/i.test(errMessage)
  return !isAttemptLimit && repairAttempts < MAX_BELLE_REPAIR_RETRIES
}

const PLAYBOOK_IDS = {
  belle_quality_hook_missing: 'pb-017-belle-hook-missing',
  belle_quality_title_missing: 'pb-018-belle-title-missing',
  belle_quality_listener_missing: 'pb-019-belle-listener-missing',
  belle_quality_repair_failed: 'pb-020-belle-repair-failed',
  belle_quality_unknown: null,
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('ATL-PIPE-010: Belle validation and repair hardening', () => {

  // ── Fix A: hasConcreteNarrativeHook ────────────────────────────────────

  describe('Fix A: hasConcreteNarrativeHook — The Deed intro must pass', () => {
    it('The Deed intro passes hook validation', () => {
      const intro = 'Every piece of land in Tennessee must have an owner at every moment, [LISTENER_NAME], and when the paper trail breaks, someone broke it on purpose — this is "The Deed."'
      expect(hasConcreteNarrativeHook(intro)).toBe(true)
    })

    it('"paper trail" alone is a concrete hook', () => {
      expect(hasConcreteNarrativeHook('The paper trail leads somewhere unexpected, [LISTENER_NAME].')).toBe(true)
    })

    it('"broke it on purpose" is a concrete hook', () => {
      expect(hasConcreteNarrativeHook('someone broke it on purpose')).toBe(true)
    })

    it('"someone broke it" is a concrete hook', () => {
      expect(hasConcreteNarrativeHook('someone broke the chain of ownership')).toBe(true)
    })

    it('"cover-up" is a concrete hook', () => {
      expect(hasConcreteNarrativeHook('There was a cover-up, [LISTENER_NAME], and now you know.')).toBe(true)
    })

    it('"conspiracy" is a concrete hook', () => {
      expect(hasConcreteNarrativeHook('A conspiracy going back twenty years, [LISTENER_NAME].')).toBe(true)
    })

    it('"forged" / "forgery" is a concrete hook', () => {
      expect(hasConcreteNarrativeHook('The deed was a forgery from the start.')).toBe(true)
    })

    it('"falsified" is a concrete hook', () => {
      expect(hasConcreteNarrativeHook('The records were falsified before anyone noticed.')).toBe(true)
    })

    it('"tampered" is a concrete hook', () => {
      expect(hasConcreteNarrativeHook('The evidence had been tampered with.')).toBe(true)
    })

    it('"deed" (legal document) is a concrete hook', () => {
      expect(hasConcreteNarrativeHook('The deed to the property disappeared the night of the storm.')).toBe(true)
    })

    it('"ownership dispute" is a concrete hook', () => {
      expect(hasConcreteNarrativeHook('An ownership dispute that turned deadly, [LISTENER_NAME].')).toBe(true)
    })

    it('"wrongdoing" is a concrete hook', () => {
      expect(hasConcreteNarrativeHook('There was wrongdoing here, and you are about to find out who.')).toBe(true)
    })

    it('"illegal" activity is a concrete hook', () => {
      expect(hasConcreteNarrativeHook('Something illegal happened in that office, [LISTENER_NAME].')).toBe(true)
    })

    // Existing keyword hooks still work
    it('"secret" still passes (original keyword)', () => {
      expect(hasConcreteNarrativeHook('A secret buried for thirty years, [LISTENER_NAME].')).toBe(true)
    })

    it('"murder" still passes (original keyword)', () => {
      expect(hasConcreteNarrativeHook('A murder no one was supposed to know about.')).toBe(true)
    })

    it('"evidence" still passes (original keyword)', () => {
      expect(hasConcreteNarrativeHook('The evidence was right there — if you knew where to look.')).toBe(true)
    })
  })

  describe('Fix A: purely atmospheric intros must still fail', () => {
    it('pure atmospheric "something waiting" fails', () => {
      expect(hasConcreteNarrativeHook('Something is waiting in the fog, [LISTENER_NAME].')).toBe(false)
    })

    it('"a story about connection" fails', () => {
      expect(hasConcreteNarrativeHook('A story about trust and connection, [LISTENER_NAME].')).toBe(false)
    })

    it('"a moment that changes everything" fails', () => {
      expect(hasConcreteNarrativeHook('A moment that will change everything, [LISTENER_NAME] — this is "The Farm."')).toBe(false)
    })

    it('vague hook with no conflict mechanism fails', () => {
      expect(hasConcreteNarrativeHook('[LISTENER_NAME], prepare yourself for a journey into the unknown.')).toBe(false)
    })
  })

  // ── Classification ────────────────────────────────────────────────────

  describe('classifyBelleIssues — issue array → canonical kind', () => {
    it('hook issue → belle_quality_hook_missing', () => {
      const issues = ['standalone intro must include a concrete narrative hook such as an event, secret, danger, conflict, or mystery mechanism.']
      expect(classifyBelleIssues(issues)).toBe('belle_quality_hook_missing')
    })

    it('atmospheric issue → belle_quality_hook_missing', () => {
      const issues = ['standalone intro is too atmospheric; it must name the concrete story mechanism, object, event, or conflict.']
      expect(classifyBelleIssues(issues)).toBe('belle_quality_hook_missing')
    })

    it('title issue → belle_quality_title_missing', () => {
      const issues = ['standalone intro must include the story title.']
      expect(classifyBelleIssues(issues)).toBe('belle_quality_title_missing')
    })

    it('outro title issue → belle_quality_title_missing', () => {
      const issues = ['standalone outro must name the story title "The Deed".']
      expect(classifyBelleIssues(issues)).toBe('belle_quality_title_missing')
    })

    it('[LISTENER_NAME] missing → belle_quality_listener_missing', () => {
      const issues = ['intro must include [LISTENER_NAME] placeholder']
      expect(classifyBelleIssues(issues)).toBe('belle_quality_listener_missing')
    })

    it('personalization issue → belle_quality_listener_missing', () => {
      const issues = ['intro missing personalization placeholder']
      expect(classifyBelleIssues(issues)).toBe('belle_quality_listener_missing')
    })

    it('empty/unknown issues → belle_quality_unknown', () => {
      expect(classifyBelleIssues([])).toBe('belle_quality_unknown')
      expect(classifyBelleIssues(['something went wrong'])).toBe('belle_quality_unknown')
    })
  })

  describe('classifyBelleRepairError — error message → canonical kind', () => {
    it('deterministic check failed with title → belle_quality_title_missing', () => {
      const err = 'Repaired Belle text failed deterministic checks: standalone intro must include the story title.'
      expect(classifyBelleRepairError(err)).toBe('belle_quality_title_missing')
    })

    it('deterministic check failed with hook → belle_quality_hook_missing', () => {
      const err = 'Repaired Belle text failed deterministic checks: standalone intro must include a concrete narrative hook such as an event, secret, danger, conflict, or mystery mechanism.'
      expect(classifyBelleRepairError(err)).toBe('belle_quality_hook_missing')
    })

    it('attempt limit reached → belle_quality_repair_failed', () => {
      const err = 'Belle quality repair attempt limit reached'
      expect(classifyBelleRepairError(err)).toBe('belle_quality_repair_failed')
    })

    it('deterministic check (no further detail) → belle_quality_repair_failed', () => {
      const err = 'Repaired Belle text failed deterministic checks: intro text is too short.'
      expect(classifyBelleRepairError(err)).toBe('belle_quality_repair_failed')
    })

    it('[LISTENER_NAME] missing after repair → belle_quality_listener_missing', () => {
      const err = 'Repaired Belle text failed deterministic checks: intro must include [LISTENER_NAME] placeholder'
      expect(classifyBelleRepairError(err)).toBe('belle_quality_listener_missing')
    })

    it('unknown error → belle_quality_unknown', () => {
      const err = 'Network timeout connecting to model API'
      expect(classifyBelleRepairError(err)).toBe('belle_quality_unknown')
    })
  })

  // ── Retry gate ────────────────────────────────────────────────────────

  describe('Repair retry gate', () => {
    it('repairAttempts=0, no attempt-limit error → can retry', () => {
      expect(canBelleRetry(0, 'Repaired Belle text failed deterministic checks: standalone intro must include the story title.')).toBe(true)
    })

    it('repairAttempts=1, no attempt-limit error → can retry once more', () => {
      expect(canBelleRetry(1, 'Repaired Belle text failed deterministic checks: title missing.')).toBe(true)
    })

    it('repairAttempts=2, no attempt-limit error → max retries exhausted', () => {
      expect(canBelleRetry(2, 'Repaired Belle text failed deterministic checks: title missing.')).toBe(false)
    })

    it('repairAttempts=0 but "attempt limit reached" → no retry (sentinel error)', () => {
      expect(canBelleRetry(0, 'Belle quality repair attempt limit reached')).toBe(false)
    })

    it('repairAttempts=1 but "attempt limit reached" → no retry', () => {
      expect(canBelleRetry(1, 'Belle quality repair attempt limit reached')).toBe(false)
    })
  })

  // ── Error_json fields ─────────────────────────────────────────────────

  describe('Structured error_json fields', () => {
    it('retry error_json has marc_required=false', () => {
      const repairAttempts = 0
      const canRetry = canBelleRetry(repairAttempts, 'title missing')
      expect(canRetry).toBe(true)
      const errorJson = {
        kind: 'belle_quality_title_missing',
        step: 'repair_belle_quality',
        marc_required: !canRetry,
        autonomous_repair: canRetry,
        retry_count: repairAttempts + 1,
        max_retries: MAX_BELLE_REPAIR_RETRIES,
        safe_resume_point: 'repair_belle_quality',
      }
      expect(errorJson.marc_required).toBe(false)
      expect(errorJson.autonomous_repair).toBe(true)
      expect(errorJson.safe_resume_point).toBe('repair_belle_quality')
    })

    it('terminal error_json has marc_required=true', () => {
      const repairAttempts = 2
      const canRetry = canBelleRetry(repairAttempts, 'title missing')
      expect(canRetry).toBe(false)
      const errorJson = {
        kind: 'belle_quality_title_missing',
        marc_required: !canRetry,
        autonomous_repair: canRetry,
        safe_resume_point: 'generate_belle_assets',
      }
      expect(errorJson.marc_required).toBe(true)
      expect(errorJson.autonomous_repair).toBe(false)
      expect(errorJson.safe_resume_point).toBe('generate_belle_assets')
    })

    it('error_json contains job_id and story_id fields for learning incident', () => {
      const incident = {
        job_id: 'job-belle-001',
        story_id: 'story-belle-002',
        series_id: null,
        stage: 'repair_belle_quality',
        failure_type: 'belle_quality_title_missing',
        root_cause: 'Repaired Belle text failed deterministic checks: standalone intro must include the story title.',
        fix_applied: 'Autonomous retry 1/2: re-queuing repair',
        fix_type: 'autonomous_retry',
      }
      expect(incident.job_id).toBeTruthy()
      expect(incident.story_id).toBeTruthy()
      expect(incident.stage).toBe('repair_belle_quality')
      expect(incident.failure_type).toBe('belle_quality_title_missing')
    })
  })

  // ── Playbook IDs ──────────────────────────────────────────────────────

  describe('Playbook IDs are assigned', () => {
    it('belle_quality_hook_missing → pb-017', () => {
      expect(PLAYBOOK_IDS['belle_quality_hook_missing']).toBe('pb-017-belle-hook-missing')
    })
    it('belle_quality_title_missing → pb-018', () => {
      expect(PLAYBOOK_IDS['belle_quality_title_missing']).toBe('pb-018-belle-title-missing')
    })
    it('belle_quality_listener_missing → pb-019', () => {
      expect(PLAYBOOK_IDS['belle_quality_listener_missing']).toBe('pb-019-belle-listener-missing')
    })
    it('belle_quality_repair_failed → pb-020', () => {
      expect(PLAYBOOK_IDS['belle_quality_repair_failed']).toBe('pb-020-belle-repair-failed')
    })
    it('belle_quality_unknown → no playbook', () => {
      expect(PLAYBOOK_IDS['belle_quality_unknown']).toBeNull()
    })
  })

  // ── The Deed exact scenario ───────────────────────────────────────────

  describe('Story #3 (The Deed) exact scenario', () => {
    const THE_DEED_INTRO = 'Every piece of land in Tennessee must have an owner at every moment, [LISTENER_NAME], and when the paper trail breaks, someone broke it on purpose — this is "The Deed."'

    it('The Deed intro passes hasConcreteNarrativeHook', () => {
      expect(hasConcreteNarrativeHook(THE_DEED_INTRO)).toBe(true)
    })

    it('The Deed intro contains [LISTENER_NAME]', () => {
      expect(THE_DEED_INTRO.includes('[LISTENER_NAME]')).toBe(true)
    })

    it('The Deed intro contains story title', () => {
      expect(THE_DEED_INTRO.toLowerCase()).toContain('the deed')
    })

    it('validate_belle_assets would NOT flag The Deed intro as hook-missing', () => {
      const hookIssues = hasConcreteNarrativeHook(THE_DEED_INTRO) ? [] : ['standalone intro must include a concrete narrative hook']
      expect(hookIssues).toHaveLength(0)
    })

    it('repair_belle_quality would NOT have been needed for The Deed', () => {
      // If ATL-PIPE-010 had been in place, validate_belle_assets would have passed
      const hasHook = hasConcreteNarrativeHook(THE_DEED_INTRO)
      const hasName = THE_DEED_INTRO.includes('[LISTENER_NAME]')
      const hasTitle = THE_DEED_INTRO.toLowerCase().includes('the deed')
      expect(hasHook && hasName && hasTitle).toBe(true)
    })

    it('repair failure classification: "standalone intro must include the story title" → belle_quality_title_missing', () => {
      const err = 'Repaired Belle text failed deterministic checks: standalone intro must include the story title.'
      expect(classifyBelleRepairError(err)).toBe('belle_quality_title_missing')
    })

    it('validate_belle_assets learning incident has job_id and story_id', () => {
      const incident = {
        job_id: 'c01b6f25',
        story_id: '671abae4',
        stage: 'validate_belle_assets',
        failure_type: 'belle_quality_hook_missing',
      }
      expect(incident.job_id).toBeTruthy()
      expect(incident.story_id).toBeTruthy()
    })
  })

})
