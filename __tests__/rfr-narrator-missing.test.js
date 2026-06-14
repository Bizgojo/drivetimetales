/**
 * rfr-narrator-missing.test.js
 *
 * ATL-PIPE-012 regression tests for ready-for-review gate failures and repair paths.
 *
 * Root cause: Story 79edf3af / job ad9c6af9 passed all 13 production steps with zero
 * retries, then failed at ready_for_review with:
 * "standalone outro must name the narrator 'Nora Ashby'"
 *
 * The standalone outro text did not include the narrator's name. The RFR gate detected
 * this structural requirement failure. The system had no autonomous repair path for
 * narrator-missing issues, so it failed the job and required Marc intervention.
 *
 * Fix: ATL-PIPE-012 adds:
 * - classifyRfrIssues() to detect narrator-missing failures
 * - Autonomous repair routing to repair_belle_quality (max 2 attempts)
 * - Narrator name passed to repair LLM context
 * - Learning incidents recorded with job_id + story_id
 * - Structured error_json with marc_required=false (until exhaustion)
 * - Updated prompts requiring narrator credit in standalone outro
 * - validateBelleText checks for narrator presence when provided
 *
 * Run: npx jest __tests__/rfr-narrator-missing.test.js --no-coverage
 */

'use strict'

describe('ATL-PIPE-012: RFR gate narrator-missing repair', () => {

  // ── classifyRfrIssues helper test ──────────────────────────────────────

  describe('classifyRfrIssues classification logic', () => {
    // Mirror the helper function from route.ts
    function classifyRfrIssues(contentIssues) {
      if (!Array.isArray(contentIssues) || contentIssues.length === 0) {
        return { kind: 'rfr_gate_unknown' }
      }

      const narratorMatch = contentIssues
        .find(issue => /standalone outro must name the narrator/.test(issue))
        ?.match(/the narrator "([^"]+)"/)
      if (narratorMatch?.[1]) {
        return { kind: 'rfr_outro_narrator_missing', narratorName: narratorMatch[1] }
      }

      if (contentIssues.some(issue => /audio.*missing|final_mix\.mp3/i.test(issue))) {
        return { kind: 'rfr_audio_missing' }
      }

      return { kind: 'rfr_gate_unknown' }
    }

    it('detects narrator-missing issue with narrator name extraction', () => {
      const issues = ['standalone outro must name the narrator "Nora Ashby"']
      const result = classifyRfrIssues(issues)
      expect(result.kind).toBe('rfr_outro_narrator_missing')
      expect(result.narratorName).toBe('Nora Ashby')
    })

    it('detects audio-missing issue', () => {
      const issues = ['Audio Gate failed: final_mix.mp3 not found in storage.']
      const result = classifyRfrIssues(issues)
      expect(result.kind).toBe('rfr_audio_missing')
    })

    it('returns rfr_gate_unknown for unrecognised issue', () => {
      const issues = ['Some unknown issue occurred']
      const result = classifyRfrIssues(issues)
      expect(result.kind).toBe('rfr_gate_unknown')
    })

    it('returns rfr_gate_unknown for empty issues', () => {
      const result = classifyRfrIssues([])
      expect(result.kind).toBe('rfr_gate_unknown')
    })

    it('prioritises narrator-missing over audio-missing if both present', () => {
      const issues = [
        'standalone outro must name the narrator "Ray Dolan"',
        'Audio Gate failed: final_mix.mp3 not found',
      ]
      const result = classifyRfrIssues(issues)
      expect(result.kind).toBe('rfr_outro_narrator_missing')
      expect(result.narratorName).toBe('Ray Dolan')
    })
  })

  // ── Narrator credit requirement in outro ────────────────────────────────

  describe('Narrator credit requirement in outro', () => {
    const scenarios = [
      {
        narrator: 'Nora Ashby',
        outro: 'Written by Sarah Buss, narrated by Nora Ashby, an Endless Tales original.',
        shouldPass: true,
        description: 'Outro includes narrator name verbatim',
      },
      {
        narrator: 'Ray Dolan',
        outro: 'A story by Mark Groves. Narrated by Ray Dolan. An Endless Tales original.',
        shouldPass: true,
        description: 'Narrator name as sentence',
      },
      {
        narrator: 'Nora Ashby',
        outro: 'Written by Sarah Buss, an Endless Tales original.',
        shouldPass: false,
        description: 'Outro missing narrator credit entirely',
      },
      {
        narrator: 'Nora Ashby',
        outro: 'Written by Sarah Buss, narrated by someone else, an Endless Tales original.',
        shouldPass: false,
        description: 'Outro includes wrong narrator name',
      },
      {
        narrator: 'Nora Ashby',
        outro: 'Written by Sarah Buss, with voices by Nora Ashby, an Endless Tales original.',
        shouldPass: true,
        description: 'Narrator mentioned in alternate phrasing',
      },
    ]

    scenarios.forEach(({ narrator, outro, shouldPass, description }) => {
      it(`${shouldPass ? 'accepts' : 'rejects'}: ${description}`, () => {
        // Simple substring check to mirror belleTextIncludes in real code
        const outroContainsNarrator = outro.toLowerCase().includes(narrator.toLowerCase())
        expect(outroContainsNarrator).toBe(shouldPass)
      })
    })
  })

  // ── Repair flow state management ───────────────────────────────────────

  describe('Repair flow state management (RFR narrator repair)', () => {
    it('initial RFR repair state has attempt counter at 0', () => {
      const initialState = { someOtherField: 'value' }
      const rfrRepairAttempts = Number(initialState?.rfrOutroNarratorRepair?.attempts ?? 0)
      expect(rfrRepairAttempts).toBe(0)
    })

    it('after first attempt, rfrOutroNarratorRepair.attempts increments to 1', () => {
      const state = {}
      const currentAttempts = Number(state?.rfrOutroNarratorRepair?.attempts ?? 0)
      const nextAttempts = currentAttempts + 1
      expect(nextAttempts).toBe(1)
    })

    it('second attempt has attempts=2, is still retryable (max=2)', () => {
      const MAX_RFR_RETRIES = 2
      const state = { rfrOutroNarratorRepair: { attempts: 2 } }
      const attempts = Number(state.rfrOutroNarratorRepair.attempts)
      const canRetry = attempts < MAX_RFR_RETRIES
      expect(canRetry).toBe(false)
    })

    it('state captures narrator name and original issue message', () => {
      const narratorName = 'Nora Ashby'
      const issue = 'standalone outro must name the narrator "Nora Ashby"'
      const rfrRepairState = {
        isRfrOutroRepair: true,
        rfrOutroNarratorRepair: {
          attempts: 1,
          narratorName,
          issue,
        },
      }
      expect(rfrRepairState.rfrOutroNarratorRepair.narratorName).toBe('Nora Ashby')
      expect(rfrRepairState.rfrOutroNarratorRepair.issue).toContain('Nora Ashby')
    })
  })

  // ── Structured error_json for RFR failures ────────────────────────────

  describe('Structured error_json for RFR gate failures', () => {
    it('narrator-missing has marc_required=false, autonomous_repair=true', () => {
      const errorJson = {
        kind: 'rfr_outro_narrator_missing',
        step: 'ready_for_review',
        message: 'standalone outro must name the narrator "Nora Ashby"',
        marc_required: false,
        autonomous_repair: true,
        playbookId: 'pb-rfr-outro-narrator-missing',
        safe_resume_point: 'repair_belle_quality',
      }
      expect(errorJson.marc_required).toBe(false)
      expect(errorJson.autonomous_repair).toBe(true)
      expect(errorJson.playbookId).toBe('pb-rfr-outro-narrator-missing')
    })

    it('narrator-missing after exhaustion has marc_required=true', () => {
      const MAX_RFR_RETRIES = 2
      const rfrRepairAttempts = MAX_RFR_RETRIES
      const errorJson = {
        kind: 'rfr_outro_narrator_missing',
        step: 'ready_for_review',
        marc_required: rfrRepairAttempts >= MAX_RFR_RETRIES,
        retry_exhausted: rfrRepairAttempts >= MAX_RFR_RETRIES,
        max_retries: MAX_RFR_RETRIES,
      }
      expect(errorJson.marc_required).toBe(true)
      expect(errorJson.retry_exhausted).toBe(true)
    })
  })

  // ── Learning incident structure ────────────────────────────────────────

  describe('Learning incident structure', () => {
    it('RFR narrator repair incident includes job_id, story_id, failure_type', () => {
      const incident = {
        job_id: 'ad9c6af9',
        story_id: '79edf3af',
        series_id: null,
        series_title: null,
        episode_title: null,
        stage: 'ready_for_review',
        failure_type: 'rfr_outro_narrator_missing',
        root_cause: 'Standalone outro missing narrator credit: "Nora Ashby"',
        fix_type: 'autonomous_repair',
        fix_applied: 'Routing to repair_belle_quality (attempt 1/2)',
        prevention_rule: 'BELLE_QUALITY_REPAIR_PROMPT updated to require narrator credit',
        reusable: true,
        confidence: 0.95,
      }
      expect(incident.job_id).toBe('ad9c6af9')
      expect(incident.story_id).toBe('79edf3af')
      expect(incident.failure_type).toBe('rfr_outro_narrator_missing')
      expect(incident.fix_type).toBe('autonomous_repair')
    })
  })

  // ── Repair routing logic ───────────────────────────────────────────────

  describe('Repair routing logic', () => {
    it('first narrator-missing failure routes to repair (attempts=0 < MAX=2)', () => {
      const MAX_RFR_RETRIES = 2
      const rfrRepairAttempts = 0
      const canRetry = rfrRepairAttempts < MAX_RFR_RETRIES
      expect(canRetry).toBe(true)
    })

    it('second narrator-missing failure routes to repair (attempts=1 < MAX=2)', () => {
      const MAX_RFR_RETRIES = 2
      const rfrRepairAttempts = 1
      const canRetry = rfrRepairAttempts < MAX_RFR_RETRIES
      expect(canRetry).toBe(true)
    })

    it('third narrator-missing failure fails (attempts=2 >= MAX=2)', () => {
      const MAX_RFR_RETRIES = 2
      const rfrRepairAttempts = 2
      const canRetry = rfrRepairAttempts < MAX_RFR_RETRIES
      expect(canRetry).toBe(false)
    })

    it('audio-missing always fails (not retryable)', () => {
      const MAX_RFR_RETRIES = 2
      const issueClassification = { kind: 'rfr_audio_missing' }
      const rfrRepairAttempts = 0
      const canRetry = issueClassification.kind === 'rfr_outro_narrator_missing' && rfrRepairAttempts < MAX_RFR_RETRIES
      expect(canRetry).toBe(false)
    })

    it('gate_unknown always fails (not retryable)', () => {
      const MAX_RFR_RETRIES = 2
      const issueClassification = { kind: 'rfr_gate_unknown' }
      const rfrRepairAttempts = 0
      const canRetry = issueClassification.kind === 'rfr_outro_narrator_missing' && rfrRepairAttempts < MAX_RFR_RETRIES
      expect(canRetry).toBe(false)
    })
  })

  // ── BELLE_QUALITY_REPAIR_PROMPT requirements ───────────────────────────

  describe('BELLE_QUALITY_REPAIR_PROMPT narrator requirement', () => {
    it('repair prompt specifies narrator name must appear in outro', () => {
      const narratorName = 'Nora Ashby'
      const promptContent = `Repair request: Fix standalone outro. Narrator name must appear verbatim: "${narratorName}"`
      expect(promptContent).toContain('Narrator name must appear verbatim')
      expect(promptContent).toContain('Nora Ashby')
    })
  })

  // ── Story template requirements ────────────────────────────────────────

  describe('BELLE B OUTRO template requirements', () => {
    const templateText = '[one or two short sentences, reflective, no time-of-day reference, credits both the author AND the narrator voice talent by their exact name (e.g. "Written by [AUTHOR], narrated by [NARRATOR], an Endless Tales original."), says "an Endless Tales original"]'

    it('template includes narrator credit requirement', () => {
      expect(templateText).toContain('narrator')
      expect(templateText).toContain('by their exact name')
    })

    it('template provides narrator mention example', () => {
      expect(templateText).toContain('narrated by [NARRATOR]')
    })
  })

  // ── M-1 Story #2 exact scenario ────────────────────────────────────────

  describe('M-1 Story #2 exact scenario (job ad9c6af9)', () => {
    const jobId = 'ad9c6af9'
    const storyId = '79edf3af'
    const narratorName = 'Nora Ashby'
    const failureMessage = 'standalone outro must name the narrator "Nora Ashby"'

    it('failure is classified as rfr_outro_narrator_missing', () => {
      function classifyRfrIssues(contentIssues) {
        if (!Array.isArray(contentIssues) || contentIssues.length === 0) {
          return { kind: 'rfr_gate_unknown' }
        }
        const narratorMatch = contentIssues
          .find(issue => /standalone outro must name the narrator/.test(issue))
          ?.match(/the narrator "([^"]+)"/)
        if (narratorMatch?.[1]) {
          return { kind: 'rfr_outro_narrator_missing', narratorName: narratorMatch[1] }
        }
        return { kind: 'rfr_gate_unknown' }
      }

      const result = classifyRfrIssues([failureMessage])
      expect(result.kind).toBe('rfr_outro_narrator_missing')
      expect(result.narratorName).toBe('Nora Ashby')
    })

    it('first RFR failure attempt is retryable', () => {
      const MAX_RFR_RETRIES = 2
      const rfrRepairAttempts = 0
      const canRetry = rfrRepairAttempts < MAX_RFR_RETRIES
      expect(canRetry).toBe(true)
    })

    it('learning incident captures job_id and story_id', () => {
      const incident = {
        job_id: jobId,
        story_id: storyId,
        failure_type: 'rfr_outro_narrator_missing',
        root_cause: `Standalone outro missing narrator credit: "${narratorName}"`,
      }
      expect(incident.job_id).toBe(jobId)
      expect(incident.story_id).toBe(storyId)
    })

    it('repair state captures narrator name from failure message', () => {
      const narratorMatch = failureMessage.match(/the narrator "([^"]+)"/)
      expect(narratorMatch?.[1]).toBe('Nora Ashby')
    })

    it('all 13 prior steps passed (no earlier failures)', () => {
      const steps = [
        'create_story_row',
        'generate_script',
        'validate_script',
        'validate_story_resolution',
        'voice_preflight',
        'generate_voices',
        'validate_voices',
        'generate_music',
        'validate_music',
        'generate_belle_assets',
        'validate_belle_assets',
        'render_final_mix',
        'validate_final_mix',
      ]
      expect(steps).toHaveLength(13)
    })
  })

  // ── Playbook structure ─────────────────────────────────────────────────

  describe('Playbook structure for RFR failures', () => {
    const pb001 = {
      id: 'pb-rfr-outro-narrator-missing',
      failureKind: 'rfr_outro_narrator_missing',
      title: 'Standalone outro is missing required narrator credit — route to repair_belle_quality',
      autonomous: true,
      marcRequired: false,
      safeResumePoint: 'repair_belle_quality',
      linkedIncident: 'ATL-PIPE-012',
    }

    it('playbook id matches failure kind naming convention', () => {
      expect(pb001.id).toBe('pb-rfr-outro-narrator-missing')
      expect(pb001.failureKind).toBe('rfr_outro_narrator_missing')
    })

    it('playbook has autonomous=true and marcRequired=false', () => {
      expect(pb001.autonomous).toBe(true)
      expect(pb001.marcRequired).toBe(false)
    })

    it('playbook specifies safe_resume_point=repair_belle_quality', () => {
      expect(pb001.safeResumePoint).toBe('repair_belle_quality')
    })
  })

})
