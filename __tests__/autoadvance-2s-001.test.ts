describe('AUTOADVANCE-2S-001', () => {
  const s = require('fs').readFileSync(require('path').join(process.cwd(), 'components/player/CanonicalPlayer.tsx'), 'utf8')
  test('the gap is 2 seconds (Marc, Nov 15)', () => {
    expect(s).toContain('export const AUTO_ADVANCE_GAP_MS = 2000')
  })
  test('the next episode is looked up before the end and reused at the end', () => {
    expect(s).toContain('cumTime < total - AUTO_ADVANCE_PREFETCH_SECONDS')
    expect(s).toContain('prefetched && prefetched.forStoryId === storyId && prefetched.candidate')
  })
  test('auto-advanced episodes start at 0:00 after the gap', () => {
    expect(s).toContain("if (autoStartSource === 'auto_advance' && !isASC3 && resumeRef.current <= 0)")
    expect(s).toContain('Math.max(0, endedAt + AUTO_ADVANCE_GAP_MS - Date.now())')
  })
})
