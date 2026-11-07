import { findTimingOutliers, breakCount } from '@/lib/speechTiming'
import fixture from './fixtures/sunset-ep08-segments.json'

// Real production data: Sunset of Competition Ep 8, every spoken line with
// its segment file size (192 kbps → seconds = bytes / 24000).
const lines = fixture.lines.map((l: any) => ({ index: l.index, speaker: l.speaker, text: l.text, seconds: l.bytes / fixture.bytesPerSecond }))

describe('ARTIFACT-TIMING-001 line timing check', () => {
  const flags = findTimingOutliers(lines)

  it('PROOF: flags the Ruth line Marc heard ("aaaaaa", ~5:34 before the end)', () => {
    const ruth = flags.find((f) => f.index === 97)
    expect(ruth).toMatchObject({ speaker: 'RUTH', kind: 'too_long' })
    expect(ruth!.text).toMatch(/^That's the one thing I never stopped believing/)
    expect(ruth!.extraSeconds).toBeGreaterThan(2)
  })

  it('also catches a cut-off line (Greer: 19 words in 1.3 seconds)', () => {
    expect(flags.find((f) => f.index === 39)).toMatchObject({ speaker: 'GREER', kind: 'too_short' })
  })

  it('flags a small share of lines, not the whole episode', () => {
    expect(flags.length).toBeLessThanOrEqual(Math.ceil(lines.length * 0.15))
  })

  it('ignores one- and two-word lines', () => {
    expect(flags.find((f) => f.index === 64)).toBeUndefined() // RUTH: ...What?
  })

  it('counts dashes and ellipses as longer pauses', () => {
    expect(breakCount('Wait — no. Fine...')).toBeCloseTo(1 + 1.5 + 1.5 + 1, 5)
  })
})

import { planTimingPass, finishTimingPass, timedLinesFromSizes, sizesFromListing, MAX_RERECORDS_PER_EPISODE } from '@/lib/timingPass'
import fs from 'fs'
import path from 'path'

describe('ARTIFACT-TIMING-001 re-record pass', () => {
  const ep8 = { storyId: 'ep8', lines }

  it('plans one re-record per flagged line, capped per episode', () => {
    const plan = planTimingPass([ep8], '2026-11-07T00:00:00Z')
    expect(plan.done).toBe(false)
    expect(plan.queue.map((q) => q.index)).toContain(97)
    expect(plan.queue.length).toBeLessThanOrEqual(MAX_RERECORDS_PER_EPISODE)
  })

  it('a clean episode needs nothing and is done at once', () => {
    const clean = Array.from({ length: 12 }, (_, i) => ({ index: i, speaker: 'NARRATOR', text: 'one two three four five six seven eight nine ten.', seconds: 4 + (i % 3) * 0.2 }))
    expect(planTimingPass([{ storyId: 'x', lines: clean }], 'now').done).toBe(true)
  })

  it('lines still off after re-record go to the review list; fixed ones do not', () => {
    const plan = planTimingPass([ep8], 'now')
    const afterRerecord = { ...plan, queue: [], rerecorded: plan.queue.map((q) => ({ ...q, ok: true })) }
    // Pretend line 97 came back clean (normal length) and the rest did not.
    const fixedLines = lines.map((l) => (l.index === 97 ? { ...l, seconds: 5.7 } : l))
    const done = finishTimingPass(afterRerecord, [{ storyId: 'ep8', lines: fixedLines }], 'later')
    expect(done.done).toBe(true)
    expect(done.stillFlagged.map((f) => f.index)).not.toContain(97)
    expect(done.stillFlagged.map((f) => f.index)).toContain(134)
  })

  it('reads segment sizes from a storage listing', () => {
    const sizes = sizesFromListing([{ name: 'segment_0097.mp3', metadata: { size: 201918 } }, { name: 'sfx_0002.mp3', metadata: { size: 9 } }])
    expect([...sizes.entries()]).toEqual([[97, 201918]])
    expect(timedLinesFromSizes('[START AUDIO DRAMA SCRIPT]\nRUTH: Hello there friend.\n', new Map([[0, 48000]]))[0]).toMatchObject({ speaker: 'RUTH', seconds: 2 })
  })

  it('run-next runs the pass before Belle (series and standalone) and generate-voices can re-record one line', () => {
    const runNext = fs.readFileSync(path.join(__dirname, '../app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const gv = fs.readFileSync(path.join(__dirname, '../app/api/admin/generate-voices/route.ts'), 'utf8')
    expect(runNext).toMatch(/const timing = await runTimingPass\(lockedJob, timingStoryIds, origin\)[\s\S]{0,1200}runSeriesBelleAssets\(\{ \.\.\.lockedJob, state_json: timing\.state \}/)
    expect(runNext).toMatch(/const standaloneTiming = await runTimingPass\([\s\S]{0,1200}runStandaloneBelleAssets\(lockedJob, origin\)/)
    expect(runNext).toMatch(/rerecordSegment: true/)
    expect(gv).toMatch(/existingSegmentNames\.has\(targetFileName\) && rerecordSegment !== true/)
    expect(gv).toMatch(/if \(purgeExisting === true \|\| rerecordSegment === true\) \{/)
  })
})

import { scriptAudioMismatch } from '@/lib/speechTiming'
describe('SCRIPT-AUDIO-MATCH-001', () => {
  it('passes only when script positions and stored files are the same set', () => {
    expect(scriptAudioMismatch(new Set(['segment_0001.mp3', 'segment_0002.mp3']), new Set(['segment_0001.mp3', 'segment_0002.mp3']))).toBeNull()
    // Sunset Ep 18 shape: script edited after voicing, far more positions than files.
    expect(scriptAudioMismatch(new Set(['segment_0001.mp3', 'segment_0002.mp3', 'segment_0003.mp3']), new Set(['segment_0001.mp3']))).toMatch(/2 missing/)
  })
  it('re-record refuses when they do not line up', () => {
    const gv = require('fs').readFileSync(require('path').join(__dirname, '../app/api/admin/generate-voices/route.ts'), 'utf8')
    expect(gv).toMatch(/SCRIPT-AUDIO-MATCH-001: script and audio files do not line up/)
  })
})
