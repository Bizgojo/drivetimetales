import { readFileSync } from 'fs'
import { join } from 'path'
import { wordEndTime, phraseTokens, alignCachePath } from '@/lib/sfxAlign'
import { planLayeredBody, sfxV2Options } from '@/lib/sfxLayeredMix'
import { validateOverlayCues, overlayFileName, buildOverlayPrompt } from '@/lib/sfxOverlay'
import { overlayPlanFile } from '@/lib/sfxOverlayRunner'
import { buildSfxReport } from '@/lib/sfxReport'

const W = (pairs: Array<[string, number, number]>) => pairs.map(([text, start, end]) => ({ text, start, end }))

describe('SFX-WORD-001 word timing', () => {
  const words = W([['Drop', 0.1, 0.4], ['it', 0.45, 0.6], ['or', 0.7, 0.8], ["I'll", 0.85, 1.1], ['—', 1.1, 1.1], ['Nick!', 1.6, 2.0]])
  test('finds the end of the named words', () => {
    expect(wordEndTime(words, "or I'll")).toBeCloseTo(1.1)
    expect(wordEndTime(words, 'Drop it')).toBeCloseTo(0.6)
  })
  test('punctuation and case do not matter; missing words return null', () => {
    expect(wordEndTime(words, 'NICK')).toBeCloseTo(2.0)
    expect(wordEndTime(words, 'put it down')).toBeNull()
    expect(wordEndTime(words, '')).toBeNull()
  })
  test('tokens and cache path', () => {
    expect(phraseTokens("Or I’ll —")).toEqual(['or', "i'll"])
    expect(alignCachePath('abc', 7)).toBe('asc3/abc/align/segment_0007.json')
  })
})

describe('SFX-WORD-001 mix', () => {
  test('a word-anchored shot plays inside the line and takes no time of its own', () => {
    const plan = planLayeredBody([
      { kind: 'voice', idx: 1, path: '/1', dur: 3 },
      { kind: 'voice', idx: 2, path: '/2', dur: 4 },
      { kind: 'sfx', idx: 1.5, path: '/shot', dur: 1.5, cue: 'pistol shot', anchor: { voiceIdx: 2, atSec: 1.1 } },
      { kind: 'voice', idx: 3, path: '/3', dur: 2 },
    ])
    expect(plan.voices.map((v) => v.start)).toEqual([0, 3, 7])
    expect(plan.totalDuration).toBe(9)
    expect(plan.sfx[0].start).toBeCloseTo(4.1)
    expect(plan.sfx[0].role).toBe('spot')
  })
})

describe('SFX-BED-SCENE-001 backgrounds last the scene', () => {
  test('a gunshot no longer stops the rain; the next scene break does', () => {
    const plan = planLayeredBody([
      { kind: 'sfx', idx: 0.5, path: '/rain', dur: 12, cue: 'steady rain on a car roof' },
      { kind: 'voice', idx: 1, path: '/1', dur: 20 },
      { kind: 'sfx', idx: 1.5, path: '/shot', dur: 1, cue: 'pistol shot' },
      { kind: 'voice', idx: 2, path: '/2', dur: 30 },
      { kind: 'voice', idx: 3, path: '/3', dur: 10, sceneBreak: true },
    ], sfxV2Options())
    const rain = plan.sfx.find((s) => s.cue.includes('rain'))!
    const sceneBreak = plan.voices.find((v) => v.idx === 3)!.start
    expect(rain.start + rain.length).toBeCloseTo(sceneBreak)
    expect(rain.loop).toBe(true)
  })
})

describe('SFX overlay plan: in-line words and backgrounds', () => {
  const lines = [
    { index: 2, text: 'Rain hammers the roof of the car.' },
    { index: 4, text: "Drop it or I'll — Nick!" },
    { index: 10, text: 'Somebody runs.' },
  ]
  test('afterWords kept only when those exact words are in the line', () => {
    const { cues } = validateOverlayCues({ cues: [
      { beforeIndex: 4, cue: 'single pistol shot in a garage', durationSec: 2, afterWords: "or I'll" },
      { beforeIndex: 10, cue: 'running footsteps on concrete', durationSec: 3, afterWords: 'not in this line' },
    ] }, lines, 40)
    expect(cues.find((c) => c.beforeIndex === 4)?.afterWords).toBe("or I'll")
    expect(cues.find((c) => c.beforeIndex === 10)?.afterWords).toBeUndefined()
  })
  test('a scene background may share a line with a spot and gets a long clip', () => {
    const { cues } = validateOverlayCues({ cues: [
      { beforeIndex: 2, cue: 'steady rain on a car roof, constant', durationSec: 15 },
      { beforeIndex: 2, cue: 'car door slams', durationSec: 1 },
    ] }, lines, 40)
    expect(cues).toHaveLength(2)
    expect(cues.find((c) => /rain/.test(c.cue))?.durationSec).toBe(15)
  })
  test('prompt asks for in-line words and scene backgrounds, no target number', () => {
    const p = buildOverlayPrompt([{ index: 1, speaker: 'NICK', text: 'Go.' }], 40, 'Crime', [], { v2: true })
    expect(p).toMatch(/afterWords/)
    expect(buildOverlayPrompt([{ index: 1, speaker: 'NICK', text: 'Go.' }], 40, 'Crime', [])).not.toMatch(/afterWords/)
    expect(p).toMatch(/Scene backgrounds/)
    expect(p).toMatch(/no target number/)
  })
})

describe('SFX-PREVIEW-001 test copy never touches the published episode', () => {
  test('test plan and files have their own names', () => {
    expect(overlayPlanFile('v2')).toBe('sfx-overlay-v2.json')
    expect(overlayPlanFile(null)).toBe('sfx-overlay.json')
    expect(overlayFileName(12, { tag: 'v2', bed: true })).toBe('sfx_overlay_v2_0012_bed.mp3')
    expect(overlayFileName(12)).toBe('sfx_overlay_0012.mp3')
  })
  test('render returns before any published upload or story update when previewTag is set', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/asc3/render-final-mix/core.ts'), 'utf8')
    const preview = src.indexOf('if (opts.previewTag) {')
    expect(preview).toBeGreaterThan(0)
    for (const marker of ["`asc3/${storyId}/story_body.mp3`", "`asc3/${storyId}/final_mix.mp3`", ".from('stories').update(", 'saveManifest({']) {
      expect(src.indexOf(marker)).toBeGreaterThan(preview)
    }
  })
  test('report says where each sound lands', () => {
    const r = buildSfxReport('Test', [{ episodeNumber: 1, title: 'Lower Wacker', positions: [
      { index: 2, kind: 'voice', speaker: 'NARRATOR', text: 'Rain hammers the roof.' } as any,
      { index: 4, kind: 'voice', speaker: 'NICK', text: "Drop it or I'll — Nick!" } as any,
    ], scriptSources: {}, overlay: { storyId: 's', genre: '', createdAt: '', model: null, cues: [
      { beforeIndex: 2, cue: 'steady rain on a car roof', durationSec: 15, file: 'a.mp3', source: { kind: 'library', libraryName: 'rain on car' } },
      { beforeIndex: 4, cue: 'pistol shot', durationSec: 2, file: 'b.mp3', afterWords: "or I'll", source: { kind: 'ai' } },
    ] } }])
    expect(r).toMatch(/line 2 \(background\)/)
    expect(r).toMatch(/right after "or I'll"/)
  })
})
