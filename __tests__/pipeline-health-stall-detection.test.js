/**
 * Orion item 13: Tests for pipeline health stall detection logic.
 *
 * Tests the classification logic in /api/admin/pipeline-health:
 *   CRITICAL:  active_jobs > 0 AND completions_2h == 0
 *   WARNING:   active_jobs > 0 AND completions_15min == 0 AND completions_2h < 3
 *   OK:        everything else (no active jobs, or completions recent enough)
 */

'use strict'

// ── Isolated replica of stall classification logic ────────────────────────

/**
 * @param {{ activeJobs: number, completions2h: number, completions15min: number }} metrics
 * @returns {{ stall: boolean, alert_level: 'OK'|'WARNING'|'CRITICAL', message: string }}
 */
function classifyPipelineHealth({ activeJobs, completions2h, completions15min }) {
  if (activeJobs > 0 && completions2h === 0) {
    return {
      stall: true,
      alert_level: 'CRITICAL',
      message: `Runner stall: ${activeJobs} active jobs, 0 completions in 2h`,
    }
  }

  if (activeJobs > 0 && completions15min === 0 && completions2h < 3) {
    return {
      stall: false,
      alert_level: 'WARNING',
      message: `Pipeline slowing: ${activeJobs} active jobs, ${completions2h} completions in 2h, 0 in last 15min`,
    }
  }

  return {
    stall: false,
    alert_level: 'OK',
    message: `Pipeline healthy: ${activeJobs} active, ${completions2h} completions in 2h`,
  }
}

/**
 * Build alert message (mirrors route.ts buildAlertMessage).
 */
function buildAlertMessage({ alert_level, activeJobs, completions2h, completions15min, unlockedZombies, oldestActiveJob, checkedAt }) {
  const icon = alert_level === 'CRITICAL' ? '🔴' : '🟡'
  const label = alert_level === 'CRITICAL' ? 'PIPELINE STALL' : 'PIPELINE WARNING'

  const lines = [
    `${icon} *${label}*`,
    `*${activeJobs} active jobs, ${completions2h} completions in 2h*`,
    '',
  ]

  if (oldestActiveJob) {
    const step = oldestActiveJob.current_step ?? 'unknown'
    lines.push(`Oldest active job: \`${oldestActiveJob.id}\` at step \`${step}\``)
  }

  lines.push(`Unlocked zombies: ${unlockedZombies}`)
  lines.push(`Completions (last 15min): ${completions15min}`)
  lines.push('')
  lines.push(`_Action: Orion alerted — check Command Center_`)
  lines.push(`_Checked at: ${checkedAt}_`)

  return lines.join('\n')
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Pipeline health stall detection (Orion item 13)', () => {

  describe('CRITICAL stall: active jobs with 0 completions in 2h', () => {
    it('classifies as CRITICAL when 3 active jobs and 0 completions in 2h', () => {
      const result = classifyPipelineHealth({ activeJobs: 3, completions2h: 0, completions15min: 0 })
      expect(result.alert_level).toBe('CRITICAL')
      expect(result.stall).toBe(true)
      expect(result.message).toContain('Runner stall')
      expect(result.message).toContain('3 active jobs')
    })

    it('classifies as CRITICAL when 1 active job and 0 completions in 2h', () => {
      const result = classifyPipelineHealth({ activeJobs: 1, completions2h: 0, completions15min: 0 })
      expect(result.alert_level).toBe('CRITICAL')
      expect(result.stall).toBe(true)
    })
  })

  describe('WARNING: active jobs, recent completions slow but non-zero', () => {
    it('classifies as WARNING when 2 active, 2 completions in 2h, 0 in 15min', () => {
      const result = classifyPipelineHealth({ activeJobs: 2, completions2h: 2, completions15min: 0 })
      expect(result.alert_level).toBe('WARNING')
      expect(result.stall).toBe(false)
      expect(result.message).toContain('Pipeline slowing')
    })

    it('classifies as WARNING when active, 1 completion in 2h but 0 in 15min', () => {
      const result = classifyPipelineHealth({ activeJobs: 1, completions2h: 1, completions15min: 0 })
      expect(result.alert_level).toBe('WARNING')
    })

    it('does NOT classify as WARNING when completions2h >= 3 (healthy throughput)', () => {
      const result = classifyPipelineHealth({ activeJobs: 2, completions2h: 3, completions15min: 0 })
      // 3 completions in 2h with 0 in last 15min — still OK (pipeline may be tapering off)
      expect(result.alert_level).toBe('OK')
    })
  })

  describe('OK: no active jobs or healthy completion rate', () => {
    it('classifies as OK when no active jobs', () => {
      const result = classifyPipelineHealth({ activeJobs: 0, completions2h: 5, completions15min: 2 })
      expect(result.alert_level).toBe('OK')
      expect(result.stall).toBe(false)
    })

    it('classifies as OK when active jobs AND recent completions exist', () => {
      const result = classifyPipelineHealth({ activeJobs: 2, completions2h: 4, completions15min: 1 })
      expect(result.alert_level).toBe('OK')
      expect(result.stall).toBe(false)
    })

    it('classifies as OK when queue is empty and no completions (idle system)', () => {
      const result = classifyPipelineHealth({ activeJobs: 0, completions2h: 0, completions15min: 0 })
      expect(result.alert_level).toBe('OK')
      expect(result.stall).toBe(false)
    })
  })

  describe('Telegram alert message format', () => {
    it('includes PIPELINE STALL and Orion alert text for CRITICAL', () => {
      const msg = buildAlertMessage({
        alert_level: 'CRITICAL',
        activeJobs: 6,
        completions2h: 0,
        completions15min: 0,
        unlockedZombies: 2,
        oldestActiveJob: { id: '3201ceb2', current_step: 'voice_generation' },
        checkedAt: '2026-07-08T08:07:00.000Z',
      })
      expect(msg).toContain('🔴')
      expect(msg).toContain('PIPELINE STALL')
      expect(msg).toContain('6 active jobs')
      expect(msg).toContain('3201ceb2')
      expect(msg).toContain('voice_generation')
      expect(msg).toContain('Unlocked zombies: 2')
      expect(msg).toContain('Orion alerted')
      expect(msg).toContain('Command Center')
    })

    it('includes WARNING icon for WARNING level', () => {
      const msg = buildAlertMessage({
        alert_level: 'WARNING',
        activeJobs: 2,
        completions2h: 1,
        completions15min: 0,
        unlockedZombies: 0,
        oldestActiveJob: null,
        checkedAt: '2026-07-08T10:00:00.000Z',
      })
      expect(msg).toContain('🟡')
      expect(msg).toContain('PIPELINE WARNING')
      expect(msg).not.toContain('🔴')
    })
  })

})
