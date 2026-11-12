import { onlyRuntimeMaxBlockers, buildTrimPrompt, parseTrimReply } from '@/lib/writerTrim'
import { readFileSync } from 'fs'
import { join } from 'path'

const original = [
  'TITLE: The Last Bid',
  'DESCRIPTION: A deal goes wrong.',
  'BELLE B: Welcome back to Second Rise.',
  'NARRATOR: The room was quiet. The room was very, very quiet.',
  'MAYA: We have one hour.',
  'BELLE B OUTRO: Episode Eight is next.',
].join('\n')

describe('WRITER-TRIM-001 trigger', () => {
  test('fires only when every hard blocker is the series length ceiling', () => {
    expect(onlyRuntimeMaxBlockers(['RUNTIME-SERIES-MAX: 3034 spoken words (~19.0 min) vs 14-min brief; max 3024 spoken words'])).toBe(true)
    expect(onlyRuntimeMaxBlockers(['RUNTIME-SERIES-MAX: 3034 spoken words', 'BELLE-CONTENT: outro too long'])).toBe(false)
    expect(onlyRuntimeMaxBlockers(['RUNTIME: 9.0 min est.'])).toBe(false)
    expect(onlyRuntimeMaxBlockers([])).toBe(false)
  })
})

describe('WRITER-TRIM-001 prompt and reply', () => {
  test('prompt names the numbers, the keep-list and asks for the whole script', () => {
    const p = buildTrimPrompt({ script: original, spokenWords: 3034, targetWords: 2240, minWords: 2016, maxWords: 2464, isFinale: false })
    expect(p).toContain('about 3034 spoken words')
    expect(p).toContain('about 2240 spoken words')
    expect(p).toContain('never fewer than 2016')
    expect(p).toContain('Cut about 794')
    expect(p).toMatch(/final cliffhanger/)
    expect(p).toMatch(/BELLE B intro and outro lines word for word/)
    expect(p).toMatch(/Do not add anything new/)
    expect(p).toContain('MAYA: We have one hour.')
  })
  test('accepts a tagged script that keeps the title and Belle lines', () => {
    const trimmed = original.replace(' The room was very, very quiet.', '')
    expect(parseTrimReply(`Here it is:\n<script>\n${trimmed}\n</script>`, original)).toBe(trimmed)
  })
  test('rejects a reply with no tags, a lost Belle line, or a lost title', () => {
    expect(parseTrimReply(original, original)).toBeNull()
    expect(parseTrimReply(`<script>${original.replace('BELLE B OUTRO: Episode Eight is next.', '')}</script>`, original)).toBeNull()
    expect(parseTrimReply(`<script>${original.replace('TITLE: The Last Bid\n', '')}</script>`, original)).toBeNull()
    expect(parseTrimReply('<script>   </script>', original)).toBeNull()
  })
})

describe('WRITER-TRIM-001 wiring', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  const block = src.slice(src.indexOf('// WRITER-TRIM-001 (Second Rise EP7'), src.indexOf('// BELLE-SPOILER-WORD-001 (Widow EP5'))
  test('runs after the writer drafts and before the episode is failed', () => {
    const trim = src.indexOf('// WRITER-TRIM-001 (Second Rise EP7')
    expect(trim).toBeGreaterThan(src.indexOf('// SPOKEN-REPEAT-REPAIR-001'))
    expect(trim).toBeLessThan(src.indexOf('`WRITER-SELF-CHECK-001: episode ${targetEpisodeNumber} still fails'))
  })
  test('re-runs the same self-check, enforces the floor, logs the call, and never touches the ceiling', () => {
    expect(block).toContain('writerSelfCheckFn(trimmed.script)')
    expect(block).toContain('afterWords >= band.min')
    expect(block).toContain('trimScriptToSeriesLength(')
    expect(block).not.toMatch(/anthropic\.messages\.create\(/)
    const helper = src.slice(src.indexOf('async function trimScriptToSeriesLength('), src.indexOf('/** WRITER-OUTRO-SHORTEN-001: shorten only'))
    expect(helper).toContain("purpose: 'writer-trim'")
    expect(helper).toContain('maxRetries: 0')
    expect(src).toMatch(/SERIES_RUNTIME_MAX_FACTOR|seriesMaxSpokenWords/)
    const lib = readFileSync(join(__dirname, '..', 'lib/scriptReadiness.ts'), 'utf8')
    expect(lib).toContain('export const SERIES_RUNTIME_MAX_FACTOR = 1.35')
  })
})
