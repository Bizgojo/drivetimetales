import { validateSeriesOutline, buildOutlinePromptBlock } from '@/lib/seriesOutline'
import { parseContinuityVerdict, continuityRewriteTarget, storyBodyText, scriptsFingerprint } from '@/lib/seriesContinuity'
import { buildStylePromptBlock, styleProfileFrom, overlaySettingsForStyle, maxMainCharacters } from '@/lib/seriesStyle'
import { validateOverlayCues } from '@/lib/sfxOverlay'
import { extractValidatorFixList } from '@/lib/seriesRewrite'

const goodOutline = {
  characters: [
    { name: 'Nick Brennan', label: 'NICK', role: 'detective, hero' },
    { name: 'Dana Ruiz', label: 'DANA', role: 'partner' },
    { name: 'Commander Ray Kessler', label: 'KESSLER', role: 'boss, antagonist' },
  ],
  threads: [
    { id: 'T1', question: 'Will Nick bring the girl home?', resolved_in: 3 },
    { id: 'T2', question: 'Who killed the witness?', resolved_in: 2 },
  ],
  episodes: [
    { episode: 1, goal: 'Nick survives the shootout and learns the girl is taken.', beats: ['shootout', 'witness dies'], resolves: [], ends_on: 'ransom call' },
    { episode: 2, goal: 'Nick finds who killed the witness.', beats: ['garage', 'confession'], resolves: ['T2'], ends_on: 'Kessler pulls him off the case' },
    { episode: 3, goal: 'Nick rescues the girl and exposes Kessler.', beats: ['warehouse', 'rescue'], resolves: ['T1'], ends_on: 'justice' },
  ],
}

describe('SERIES-OUTLINE-001', () => {
  test('a sound plan passes', () => {
    const r = validateSeriesOutline(goodOutline, 3, 5)
    expect(r.problems).toEqual([])
    expect(r.outline?.characters).toHaveLength(3)
  })

  test('the Chicago bug — a thread resolved in two episodes — is rejected', () => {
    const bad = JSON.parse(JSON.stringify(goodOutline))
    bad.episodes[1].resolves.push('T1')
    const r = validateSeriesOutline(bad, 3, 5)
    expect(r.outline).toBeNull()
    expect(r.problems.join(' ')).toMatch(/T1.*more than one episode/)
  })

  test('too many characters, missing episodes, finale resolving nothing', () => {
    const bad = JSON.parse(JSON.stringify(goodOutline))
    bad.characters = Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, label: `P${i}`, role: 'x' }))
    bad.episodes = bad.episodes.slice(0, 2)
    bad.threads = [{ id: 'T2', question: 'q', resolved_in: 2 }]
    const p = validateSeriesOutline(bad, 3, 5).problems.join(' | ')
    expect(p).toMatch(/6 main characters/)
    expect(p).toMatch(/episode 3 missing/)
    expect(p).toMatch(/finale resolves no thread/)
  })

  test('the writer is told what is already resolved and what must stay open', () => {
    const outline = validateSeriesOutline(goodOutline, 3, 5).outline!
    const block = buildOutlinePromptBlock(outline, 2)
    expect(block).toMatch(/NICK: Nick Brennan/)
    expect(block).toMatch(/Resolve in THIS episode: Who killed the witness\?/)
    expect(block).toMatch(/NOT YET.*Will Nick bring the girl home\? \(episode 3\)/)
    const finale = buildOutlinePromptBlock(outline, 3)
    expect(finale).toMatch(/ALREADY RESOLVED.*Who killed the witness\?/)
    expect(buildOutlinePromptBlock(null, 1)).toBe('')
  })
})

describe('SERIES-CONTINUITY-001', () => {
  test('issues → rewrite earliest named episode with a fix list the rewrite loop can read', () => {
    const v = parseContinuityVerdict({
      pass: false,
      issues: [
        { episode: 7, problem: 'Girl rescued again', fix: 'Keep the finale' },
        { episode: 4, problem: 'Girl rescued in episode 4 and again in 7', fix: 'Make the rescue fail; she is moved' },
      ],
    }, 7)
    const t = continuityRewriteTarget(v)!
    expect(t.episodeNumber).toBe(4)
    const fix = extractValidatorFixList(t.report)
    expect(fix).toMatch(/Episode 4: Girl rescued in episode 4/)
    expect(fix.indexOf('Episode 4')).toBeLessThan(fix.indexOf('Episode 7'))
  })

  test('pass, junk issues, and out-of-range episodes', () => {
    expect(continuityRewriteTarget(parseContinuityVerdict({ pass: true, issues: [] }, 5))).toBeNull()
    expect(parseContinuityVerdict({ pass: true, issues: [{ episode: 9, problem: 'x' }] }, 5).pass).toBe(true)
    expect(parseContinuityVerdict({ pass: true, issues: [{ episode: 2, problem: 'renamed' }] }, 5).pass).toBe(false)
  })

  test('story body excludes headers and the Belle B outro', () => {
    const script = 'TITLE: X\nBELLE B: intro\n[START AUDIO DRAMA SCRIPT]\nNARRATOR: Rain.\nNICK: Go.\n\nBELLE B OUTRO\n---\nBELLE B: bye'
    expect(storyBodyText(script)).toBe('NARRATOR: Rain.\nNICK: Go.')
  })

  test('fingerprint changes when any script changes', () => {
    expect(scriptsFingerprint(['a', 'b'])).toBe(scriptsFingerprint(['a', 'b']))
    expect(scriptsFingerprint(['a', 'b'])).not.toBe(scriptsFingerprint(['a', 'c']))
  })
})

describe('SERIES-STYLE-ACTION-001', () => {
  test('opt-in only', () => {
    expect(styleProfileFrom('Action')).toBe('action')
    expect(styleProfileFrom(undefined)).toBeNull()
    expect(buildStylePromptBlock(null, { episodeNumber: 1 })).toBe('')
    expect(maxMainCharacters('action')).toBe(5)
  })

  test('writer block: pace, reading level, names, recap after episode 1', () => {
    const b1 = buildStylePromptBlock('action', { episodeNumber: 1 })
    expect(b1).toMatch(/two sentences of setting/)
    expect(b1).toMatch(/grade seven to eight/)
    expect(b1).not.toMatch(/recap/)
    expect(buildStylePromptBlock('action', { episodeNumber: 3 })).toMatch(/recap/)
  })

  test('action overlay: bigger budget, tighter spacing', () => {
    expect(overlaySettingsForStyle('action', 10)).toEqual({ budget: 40, minGap: 2 })
    expect(overlaySettingsForStyle(null, 10)).toEqual({ budget: 10, minGap: 3 })
    const lines = Array.from({ length: 20 }, (_, i) => ({ index: i }))
    const raw = { cues: [0, 2, 4, 6].map((i) => ({ beforeIndex: i, cue: 'car door slams shut', durationSec: 1 })) }
    expect(validateOverlayCues(raw, lines, 18, [], 2).cues).toHaveLength(4)
    expect(validateOverlayCues(raw, lines, 18).cues).toHaveLength(2)
  })
})

describe('Marc 2026-10-29: outline + continuity are permanent', () => {
  const { seriesOutlineEnabled } = require('@/lib/seriesOutline')
  const { seriesContinuityEnabled } = require('@/lib/seriesContinuity')
  test('on by default, off only when explicitly disabled', () => {
    expect(seriesOutlineEnabled({})).toBe(true)
    expect(seriesContinuityEnabled({})).toBe(true)
    expect(seriesOutlineEnabled({ SERIES_OUTLINE: 'off' })).toBe(false)
    expect(seriesContinuityEnabled({ SERIES_CONTINUITY: 'OFF' })).toBe(false)
  })
})

describe('SERIES-NEMESIS-001', () => {
  const { buildSequelHookPromptBlock, sequelHookValidatorNote, sequelHookOf } = require('@/lib/seriesSequel')
  const { buildContinuityPrompt } = require('@/lib/seriesContinuity')
  const { buildSeriesOutlinePrompt } = require('@/lib/seriesOutline')
  const hook = 'One evil nemesis eludes Nick and escapes at the end, so Nick can go after them in the next series.'
  const withNemesis = () => {
    const o = JSON.parse(JSON.stringify(goodOutline))
    o.characters.push({ name: 'Viktor Sloane', label: 'SLOANE', role: 'nemesis, drug kingpin' })
    o.threads.push({ id: 'T3', question: 'Will Nick catch Sloane?', resolved_in: 0 })
    return o
  }

  test('one open nemesis thread is required when asked for, and refused otherwise', () => {
    expect(validateSeriesOutline(withNemesis(), 3, 5, { openThreadRequired: true }).problems).toEqual([])
    expect(validateSeriesOutline(goodOutline, 3, 5, { openThreadRequired: true }).problems.join()).toMatch(/exactly one thread left open/)
    expect(validateSeriesOutline(withNemesis(), 3, 5).problems.join()).toMatch(/left unresolved/)
    const resolvedAnyway = withNemesis(); resolvedAnyway.episodes[2].resolves.push('T3')
    expect(validateSeriesOutline(resolvedAnyway, 3, 5, { openThreadRequired: true }).problems.join()).toMatch(/open thread T3 is resolved/)
  })

  test('writer sees the nemesis stays open in every episode; finale gets the escape', () => {
    const outline = validateSeriesOutline(withNemesis(), 3, 5, { openThreadRequired: true }).outline!
    expect(buildOutlinePromptBlock(outline, 2)).toMatch(/NEVER RESOLVED.*Will Nick catch Sloane\?/)
    expect(buildSequelHookPromptBlock(hook, { episodeNumber: 1, isFinale: false })).toMatch(/Introduce the nemesis/)
    const finale = buildSequelHookPromptBlock(hook, { episodeNumber: 3, isFinale: true })
    expect(finale).toMatch(/ESCAPES/)
    expect(finale).toMatch(/Do NOT say "to be continued"/)
    expect(buildSequelHookPromptBlock('', { episodeNumber: 3, isFinale: true })).toBe('')
  })

  test('validators and the plan are told the escape is approved', () => {
    expect(sequelHookValidatorNote(hook)).toMatch(/NOT an unresolved series arc/)
    expect(sequelHookValidatorNote('')).toBe('')
    expect(buildContinuityPrompt({ seriesTitle: 'X', exceptionNote: sequelHookValidatorNote(hook), episodes: [] })).toMatch(/PRODUCER-APPROVED EXCEPTION/)
    expect(buildSeriesOutlinePrompt({ title: 'X', premise: 'p', setting: 's', genre: 'Thriller', totalEpisodes: 7, requirements: '', maxMainCharacters: 5, sequelHook: hook })).toMatch(/"resolved_in": 0/)
    expect(sequelHookOf({ sequel_hook: ` ${hook} ` })).toBe(hook)
  })
})
