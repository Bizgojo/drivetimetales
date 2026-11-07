import fs from 'fs'
import path from 'path'
import { buildStoryReadPrompt, parseStoryRead, runGeminiStoryRead, geminiStoryReadSkipReason, summarizeStoryRead } from '@/lib/geminiStoryRead'
import { parseEpisodeRange } from '../scripts/gemini-story-read'

const input = {
  stage: 'script' as const,
  seriesTitle: 'Rerouted',
  factSheet: 'Daniel: brother of Ray',
  episodes: [{ episodeNumber: 1, title: 'One', body: 'DANIEL: Copy the tapes.' }, { episodeNumber: 2, title: 'Two', body: 'DANIEL: Why did you copy the tapes? Like in chapter four.' }],
}

describe('GEMINI-STORY-READ-001 report-only series read', () => {
  it('script stage asks questions 1-4 and 6 (credibility, no episode numbers), not audio', () => {
    const p = buildStoryReadPrompt(input)
    expect(p).toContain('[credibility]')
    expect(p).toMatch(/episode or chapter number/)
    expect(p).not.toContain('[audio]')
    expect(p).toContain('===== EPISODE 2: Two =====')
    expect(p).toContain('Daniel: brother of Ray')
    expect(buildStoryReadPrompt({ ...input, stage: 'final' })).toContain('[audio]')
  })
  it('parses JSON in a code fence; a question with issues fails; verdict is fix', () => {
    const raw = '```json\n{"questions":[{"id":"credibility","pass":true,"issues":[{"episode":2,"line":"Why did you copy the tapes?","problem":"Daniel asked for the copy himself.","fix":"Cut the line."}]},{"id":"logic","pass":true,"issues":[]},{"id":"made_up","pass":false,"issues":[]}]}\n```'
    const r = parseStoryRead(raw, 'script')!
    expect(r.verdict).toBe('fix')
    expect(r.questions.map((q) => q.id)).toEqual(['credibility', 'logic'])
    expect(r.questions[0].pass).toBe(false)
    expect(summarizeStoryRead(r)).toContain('Ep 2')
  })
  it('garbage reply is null, not a crash', () => {
    expect(parseStoryRead('sorry', 'script')).toBeNull()
  })
  it('never throws and never runs without a key or when switched off', async () => {
    expect(geminiStoryReadSkipReason({})).toMatch(/GEMINI_API_KEY/)
    expect(geminiStoryReadSkipReason({ GEMINI_API_KEY: 'k', GEMINI_STORY_READ: 'off' })).toMatch(/off/)
    const failing = async () => { throw new Error('HTTP 503') }
    const r = await runGeminiStoryRead(input, 'fp', { GEMINI_API_KEY: 'k' }, failing)
    expect(r.error).toMatch(/503/)
    const ok = async () => '{"questions":[{"id":"logic","pass":true,"issues":[]}]}'
    const r2 = await runGeminiStoryRead(input, 'fp', { GEMINI_API_KEY: 'k' }, ok)
    expect(r2.verdict).toBe('publish')
    expect(r2.fingerprint).toBe('fp')
  })
  it('run-next stores the read and never blocks on it', () => {
    const src = fs.readFileSync(path.join(__dirname, '../app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const at = src.indexOf('[GEMINI-STORY-READ-001]')
    expect(at).toBeGreaterThan(0)
    const block = src.slice(src.lastIndexOf('GEMINI-STORY-READ-001 (spec', at), at + 400)
    expect(block).toContain('geminiScriptRead = geminiRead')
    expect(block).not.toMatch(/return \{|throw /)
  })
  it('CLI episode range', () => {
    expect(parseEpisodeRange('1-3')).toEqual([1, 3])
    expect(parseEpisodeRange('2')).toEqual([2, 2])
    expect(parseEpisodeRange(undefined)).toBeNull()
  })
})

describe('GEMINI-READ-TIMING-001 timeout is set per caller and reported with seconds', () => {
  it('default 3 min, env override, nonsense ignored', () => {
    const { geminiStoryTimeoutMs } = require('@/lib/geminiStoryRead')
    expect(geminiStoryTimeoutMs({})).toBe(180000)
    expect(geminiStoryTimeoutMs({ GEMINI_STORY_TIMEOUT_MS: '600000' })).toBe(600000)
    expect(geminiStoryTimeoutMs({ GEMINI_STORY_TIMEOUT_MS: 'abc' })).toBe(180000)
  })
  it('the CLI waits 10 minutes', () => {
    const src = fs.readFileSync(path.join(__dirname, '../scripts/gemini-story-read.ts'), 'utf8')
    expect(src).toContain("GEMINI_STORY_TIMEOUT_MS || '600000'")
  })
})
