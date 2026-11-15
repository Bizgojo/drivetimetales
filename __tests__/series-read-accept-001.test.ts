describe('SERIES-READ-ACCEPT-001', () => {
  const s = require('fs').readFileSync(require('path').join(process.cwd(), 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  test('an accepted series read skips the whole-series reads, after kept blockers are patched', () => {
    const accept = s.indexOf('const seriesReadAccepted = ')
    expect(accept).toBeGreaterThan(s.indexOf('STOPPED-BLOCKERS-001 (Widow'))
    expect(s).toContain('!isLandingPackage && !seriesReadAccepted && continuityState.passedFingerprint !== continuityFingerprint')
  })
})
