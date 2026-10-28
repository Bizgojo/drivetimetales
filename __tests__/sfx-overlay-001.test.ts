import { readFileSync } from 'fs'
import { join } from 'path'
import { buildOverlayPrompt, overlayBodyIndex, overlayBudgetForGenre, overlayEnabled, overlayFileName, validateOverlayCues } from '@/lib/sfxOverlay'
import { planLayeredBody } from '@/lib/sfxLayeredMix'

const lines = Array.from({ length: 30 }, (_, i) => ({ index: i + 10, speaker: 'NARRATOR', text: `line ${i}` }))

describe('SFX-OVERLAY-001', () => {
  test('budget by genre: action-heavy genres get the most, quiet genres none', () => {
    expect(overlayBudgetForGenre('Thriller')).toBe(10)
    expect(overlayBudgetForGenre('Crime Drama')).toBe(10)
    expect(overlayBudgetForGenre('Western')).toBe(10)
    expect(overlayBudgetForGenre('Horror')).toBe(8)
    expect(overlayBudgetForGenre('Sci-Fi')).toBe(6)
    expect(overlayBudgetForGenre('Mystery')).toBe(4)
    expect(overlayBudgetForGenre('Heartwarming')).toBe(0)
    expect(overlayBudgetForGenre('Romance')).toBe(0)
    expect(overlayEnabled({})).toBe(false)
    expect(overlayEnabled({ SFX_OVERLAY: 'on' })).toBe(true)
  })

  test('validation keeps real anchors, spacing, budget; rejects speech/music and neighbours of script effects', () => {
    const raw = { cues: [
      { beforeIndex: 12, cue: 'three pistol shots in a parking garage', durationSec: 2 },
      { beforeIndex: 13, cue: 'tires screeching on wet concrete', durationSec: 3 }, // too close
      { beforeIndex: 99, cue: 'glass shattering', durationSec: 1 }, // not a line
      { beforeIndex: 20, cue: 'a man says hello', durationSec: 1 }, // speech
      { beforeIndex: 25, cue: 'a wooden door kicked in', durationSec: 9 }, // duration clamped
      { beforeIndex: 31, cue: 'car engine roaring away', durationSec: 4 }, // next to script sfx at 30
      { beforeIndex: 36, cue: 'running footsteps on gravel', durationSec: 2 },
    ] }
    const { cues, rejected } = validateOverlayCues(raw, lines, 2, [30])
    expect(cues.map((c) => c.beforeIndex)).toEqual([12, 25])
    expect(cues[1].durationSec).toBe(6)
    expect(rejected.map((r) => r.reason)).toEqual(expect.arrayContaining(['too close to another overlay', 'not a voice line index', 'speech or music', 'next to an existing script effect', 'over budget']))
  })

  test('prompt lists real line numbers and existing effects; files are named by anchor', () => {
    const prompt = buildOverlayPrompt(lines.slice(0, 2), 10, 'Thriller', ['rain on glass'])
    expect(prompt).toContain('10. NARRATOR: line 0')
    expect(prompt).toContain('rain on glass')
    expect(prompt).toContain('up to 10 sound effects')
    expect(overlayFileName(42)).toBe('sfx_overlay_0042.mp3')
  })

  test('an overlay lands just before its anchor line in the layered plan, without moving other lines out of order', () => {
    const plan = planLayeredBody([
      { kind: 'voice', idx: 1, path: '/1', dur: 3 },
      { kind: 'voice', idx: 2, path: '/2', dur: 3 },
      { kind: 'sfx', idx: overlayBodyIndex(2), path: '/fx', dur: 2, cue: 'two gunshots' },
      { kind: 'voice', idx: 3, path: '/3', dur: 3 },
    ])
    expect(plan.voices.map((v) => v.idx)).toEqual([1, 2, 3])
    expect(plan.sfx[0].start).toBe(3)
    expect(plan.voices[1].start).toBeCloseTo(4.5)
  })

  test('render wiring: overlays only in layered mode with SFX_OVERLAY on, never when SFX is disabled, and never fatal', () => {
    const core = readFileSync(join(__dirname, '..', 'app/api/asc3/render-final-mix/core.ts'), 'utf8')
    expect(core).toContain('if (overlayEnabled() && !sfxIsDisabled) {')
    expect(core).toContain('SFX-OVERLAY-001 overlay unavailable; mixing without it')
  })
})
