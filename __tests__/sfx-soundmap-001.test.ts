import { soundLines, flagSoundLines, validateSoundMap, buildSoundMapPrompt, soundMapPlannerEnabled, sfxSoundAgreementRule } from '@/lib/sfxSoundMap'
import { overlayFileName } from '@/lib/sfxOverlay'
import { buildSfxReport } from '@/lib/sfxReport'

const P = (index: number, kind: 'voice' | 'sfx' | 'silence', speaker: string, text: string) => ({ index, kind, speaker, text, isExpected: true, rawLineNumber: index } as any)
const positions = [
  P(1, 'voice', 'NARRATOR', 'Rain hammers Lower Wacker.'),
  P(2, 'voice', 'NICK', "Drop it or I'll — Nick!"),
  P(3, 'voice', 'NARRATOR', 'Her voice is like thunder.'),
  P(4, 'sfx', '', 'car door slams'),
  P(5, 'voice', 'NARRATOR', 'He shuts the car door and walks.'),
  P(6, 'silence', 'PAUSE', '2'),
  P(7, 'voice', 'NARRATOR', 'Inside the bar, the crowd hums.'),
  P(8, 'voice', 'GRAVES', 'Sit down.'),
]
const lines = soundLines(positions)
const flagged = flagSoundLines(lines)

describe('SFX-SOUNDMAP-001', () => {
  test('scenes are counted across scene breaks; sound words are flagged on every line that has them', () => {
    expect(lines.find((l) => l.index === 7)?.scene).toBe(2)
    expect(flagged.map((f) => f.index)).toEqual([1, 3, 5, 7])
    expect(flagged.find((f) => f.index === 1)?.words).toContain('rain')
  })

  test('every flagged line gets a decision; missing ones are recorded, not silently dropped', () => {
    const raw = { decisions: [
      { line: 1, verdict: 'skip', reason: 'covered by the scene background' },
      { line: 3, verdict: 'skip', reason: 'metaphor' },
    ], backgrounds: [{ line: 1, cue: 'steady rain on concrete, constant', durationSec: 15 }] }
    const { decisions, cues } = validateSoundMap(raw, { lines, flagged, scriptCueIndices: [4], ceiling: 40 })
    expect(decisions.map((d) => d.line)).toEqual([1, 3, 5, 7])
    expect(decisions.filter((d) => d.missing).map((d) => d.line)).toEqual([5, 7])
    expect(cues).toHaveLength(1)
  })

  test('code enforces the rules: one sound per cue, one background per scene, two effects per line, real words', () => {
    const raw = {
      backgrounds: [
        { line: 1, cue: 'steady rain on concrete, constant', durationSec: 15 },
        { line: 2, cue: 'steady traffic hum, constant', durationSec: 15 },
        { line: 7, cue: 'bar crowd murmur, steady', durationSec: 15 },
      ],
      decisions: [
        { line: 2, verdict: 'play', reason: 'shot cuts him off', cue: 'single pistol shot in a garage', durationSec: 2, afterWords: "or I'll" },
        { line: 5, verdict: 'play', reason: 'door shuts', cue: 'car door shuts then footsteps', durationSec: 2 },
        { line: 7, verdict: 'play', reason: 'not real words', cue: 'glass clinks on a bar', durationSec: 1, afterWords: 'words not here' },
      ],
    }
    const { cues, decisions, rejected } = validateSoundMap(raw, { lines, flagged, scriptCueIndices: [4], ceiling: 40 })
    expect(rejected.map((r) => r.reason)).toEqual(expect.arrayContaining(['scene already has a background', 'more than one sound in a cue']))
    expect(cues.find((c) => c.beforeIndex === 2)?.afterWords).toBe("or I'll")
    expect(cues.find((c) => /glass/.test(c.cue))?.afterWords).toBeUndefined()
    expect(decisions.find((d) => d.line === 5)?.verdict).toBe('skip')
    expect(cues.filter((c) => /murmur/.test(c.cue))).toHaveLength(1)
  })

  test('prompt demands a verdict for every flagged line and names the skip cases', () => {
    const p = buildSoundMapPrompt({ lines, flagged, genre: 'Crime', scriptCues: [{ index: 4, text: 'car door slams' }], ceiling: 40 })
    expect(p).toMatch(/For EVERY flagged line/)
    expect(p).toMatch(/metaphor/)
    expect(p).toMatch(/negated/)
    expect(p).toMatch(/ONE sound per cue/)
    expect(p).toContain('4: car door slams')
    expect(p).toContain('3. [1] NARRATOR: Her voice is like thunder.')
  })

  test('planner and writer rule stay off for production until approved', () => {
    expect(soundMapPlannerEnabled('v3', {})).toBe(true)
    expect(soundMapPlannerEnabled('v2', {})).toBe(false)
    expect(soundMapPlannerEnabled(null, {})).toBe(false)
    expect(soundMapPlannerEnabled(null, { SFX_PLANNER: 'soundmap' })).toBe(true)
    expect(sfxSoundAgreementRule({})).toBe('')
    expect(sfxSoundAgreementRule({ SFX_V2: 'on' })).toMatch(/NAMED or REACTED TO/)
  })

  test('two effects on one line get separate files', () => {
    expect(overlayFileName(7, { tag: 'v3', n: 2 })).toBe('sfx_overlay_v3_0007_2.mp3')
    expect(overlayFileName(7, { tag: 'v3', n: 1 })).toBe('sfx_overlay_v3_0007.mp3')
  })

  test('report lists every line that names a sound and what happened', () => {
    const r = buildSfxReport('Test', [{ episodeNumber: 1, title: 'Lower Wacker', positions, scriptSources: {}, overlay: {
      storyId: 's', genre: '', createdAt: '', model: null, cues: [], planner: 'soundmap',
      decisions: [
        { line: 3, verdict: 'skip', reason: 'metaphor' },
        { line: 5, verdict: 'skip', reason: 'script has the door' },
        { line: 7, verdict: 'skip', reason: 'no decision from the AI for: crowd', missing: true },
      ],
    } }])
    expect(r).toMatch(/LINES THAT NAME A SOUND — 3 lines: 0 play a sound, 3 skipped/)
    expect(r).toMatch(/SKIPPED — metaphor/)
    expect(r).toMatch(/script effect next to it/)
    expect(r).toMatch(/NOT DECIDED/)
  })
})
