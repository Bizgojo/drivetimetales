describe('MIX-LEVEL-001', () => {
  const s = require('fs').readFileSync(require('path').join(process.cwd(), 'app/api/asc3/render-final-mix/core.ts'), 'utf8')
  test('story body and sting+intro mixes undo amix halving, with a peak-only limiter', () => {
    expect(s).toContain("export const MIX_PEAK_LIMITER = 'alimiter=limit=0.891:level=false'")
    expect(s).toContain('[0:a][1:a]amix=inputs=2:duration=longest,volume=2,${MIX_PEAK_LIMITER}[mixed]')
    expect(s).toContain('[s][v]amix=inputs=2:duration=longest,volume=2,${MIX_PEAK_LIMITER}[out]')
  })
  test('no two-input amix in the final mix is left without level restore', () => {
    const bare = (s.match(/amix=inputs=2:duration=longest(?!,volume=2|\[amixed\])/g) || [])
    expect(bare).toEqual([])
  })
})
